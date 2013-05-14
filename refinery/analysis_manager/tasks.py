'''
Created on Apr 5, 2012

@author: nils
'''

from analysis_manager.models import AnalysisStatus
from celery import current_app as celery
from celery.task import chord, task
from celery.task.chords import Chord
from celery.task.sets import subtask, TaskSet
from celery.utils import uuid
from core.models import Analysis, AnalysisResult, WorkflowFilesDL, \
    AnalysisNodeConnection, INPUT_CONNECTION, OUTPUT_CONNECTION, Workflow, Download
from data_set_manager.models import Node, initialize_attribute_order
from data_set_manager.utils import get_node_types, update_annotated_nodes, \
    index_annotated_nodes, add_annotated_nodes_selection, \
    index_annotated_nodes_selection
from datetime import datetime, timedelta
from django.conf import settings
from django.contrib.sites.models import Site, Site
from django.core.urlresolvers import reverse
from django.template import loader, Context
from file_store.models import FileStoreItem, is_local
from file_store.tasks import import_file, create, rename
from galaxy_connector.connection import Connection
from galaxy_connector.galaxy_workflow import countWorkflowSteps, \
    create_workflow_graph, create_expanded_workflow_graph
from workflow_manager.tasks import configure_workflow
import ast
import copy
import data_set_manager
import logging
import os
import socket
import time
import urllib2

logger = logging.getLogger(__name__)

def send_analysis_email(analysis):
    '''
    Sends an email when the analysis finishes somehow or other

    :param analysis: Analysis object
    '''
    #get basic information
    user = analysis.get_owner()
    name = analysis.name
    site_name = Site.objects.get_current().name
    site_domain = Site.objects.get_current().domain
    status = analysis.status

    #check status and change text slightly based on that
    if status == Analysis.SUCCESS_STATUS:
        success = True
    else:
        success = False
        
    #set context for things needed in all emails
    context_dict = {'name': name,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'username': user.username,
                    'site_name': site_name,
                    'site_domain': site_domain,
                    'success': success
                    }
    if success:
        email_subj = "[%s] Archive ready for download: %s" % (site_name, name)
        context_dict['url'] = "http://%s%s" % (site_domain, reverse('core.views.analysis', args=(analysis.uuid,)))
    else:
        email_subj = "[%s] Archive creation failed: %s" % (site_name, name)
        context_dict['default_email'] = settings.DEFAULT_FROM_EMAIL

    if settings.REFINERY_REPOSITORY_MODE:
        temp_loader = loader.get_template('analysis_manager/analysis_email_repository.txt')
    else:
        workflow = analysis.workflow.name
        project = analysis.project
        
        #get project name
        project_name = project.name
        if project.is_catch_all:
            project_name = '-'

        #get information needed to calculate the duration
        start = analysis.time_start
        end = analysis.time_end
        duration = end - start
        hours, remainder = divmod(duration.total_seconds(), 3600)
        minutes, seconds = divmod(remainder, 60)
        
        #formatting the duration string 
        hours = int(hours)
        minutes = int(minutes)
        if hours < 10:
            hours = '0%s' % hours
        if minutes < 10:
            minutes = '0%s' % minutes
        duration = "%s:%s hours" % (hours, minutes)

        #fill in extra context
        context_dict['workflow'] = workflow
        context_dict['project'] = project
        context_dict['dataset'] = analysis.data_set.name
        context_dict['start'] = datetime.strftime(start, '%A, %d %B %G %r')
        context_dict['end'] = datetime.strftime(end, '%A, %d %B %G %r')
        context_dict['duration'] = duration

        #get email contents ready
        email_subj = "[%s] %s: %s (%s)" % (site_name, status, name, workflow)
        temp_loader = loader.get_template('analysis_manager/analysis_email_full.txt')
        
    context = Context(context_dict)
    try:    
        user.email_user(email_subj, temp_loader.render(context))
        logger.info('Emailed completion message with status \"%s\" to %s for analysis %s with UUID %s.' % (analysis.status, user.email, name, analysis.uuid))    
    except socket.error:
        logger.error('Email server error: status \"%s\" to %s for analysis %s with UUID %s.' % (analysis.status, user.email, name, analysis.uuid))
    
    
# example from: http://www.manasupo.com/2012/03/chord-progress-in-celery.html
class progress_chord(object):
    Chord = Chord

    def __init__(self, tasks, **options):
        self.tasks = tasks
        self.options = options

    def __call__(self, body, **options):
        tid = body.options.setdefault("task_id", uuid())
        r = self.Chord.apply_async((list(self.tasks), body), self.options, **options)
        return body.type.app.AsyncResult(tid), r

@task
def chord_execution(ret_val, analysis):
    
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    analysis_status = AnalysisStatus.objects.filter(analysis=analysis)[0]
    
    execution_taskset = []; 
    execution_taskset.append(monitor_analysis_execution.subtask((analysis,)) )
    execution_taskset.append(run_analysis_execution.subtask((analysis,)) )
    
    # DEBUGGING NOT CLEANING UP
    result_chord, result_set = progress_chord(execution_taskset)(chord_postprocessing.subtask((analysis,)))
     
    # EXECUTION
    ## TESTING NEW DEBUGGING ###
    #execution_monitor_task_id = monitor_analysis_execution.subtask((analysis,)).apply_async().task_id
    #execution_taskset = TaskSet(task=[run_analysis_execution.subtask((analysis,)) ])            
    #result_chord, result_set = progress_chord(execution_taskset)(chord_postprocessing.subtask((analysis,)))
    
    analysis_status.execution_taskset_id = result_set.task_id 
    analysis_status.save()
    
    return

@task
def emptyTask(ret_val):
    return 

@task
def chord_postprocessing (ret_val, analysis):
    logger.debug("analysis_manager.chord_postprocessing called")
    
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    analysis_status = AnalysisStatus.objects.filter(analysis=analysis)[0]
    
    # getting list of tasks for download history files
    postprocessing_taskset = download_history_files(analysis)
        
    if len(postprocessing_taskset) < 1:
        #print "---------- less than 1 -----------"
        #temp_task = emptyTask.subtask(("ret_val",))
        temp_task = emptyTask.subtask(("ret_val",))
        result_chord, result_set = progress_chord([temp_task])(chord_cleanup.subtask(analysis=analysis,))
        
    else:
        #print "---------- greater than 1 -----------"
        result_chord, result_set = progress_chord(postprocessing_taskset)(chord_cleanup.subtask(analysis=analysis,))
    
    analysis_status.postprocessing_taskset_id = result_set.task_id 
    analysis_status.save()
    
    return 

@task
def chord_cleanup(ret_val, analysis):
    """
    Code to cleanup galaxy after downloading of results from history
    """
    logger.debug("analysis_manager.chord_cleanup called")
    
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    analysis_status = AnalysisStatus.objects.filter(analysis=analysis)[0]
    
    cleanup_taskset = TaskSet(task=[run_analysis_cleanup.subtask((analysis,)) ])
                  
    result_chord, result_set = progress_chord(cleanup_taskset)(emptyTask.subtask())
    
    ### TODO ###  UPDATE CLEANUP TASKID FOR ANALYSIS_STATUS
    analysis_status.cleanup_taskset_id = result_set.task_id 
    analysis_status.save()
    
    return

# task: run analysis (outermost task, calls subtasks that monitor and run preprocessing, execution, postprocessing)
@task()
def run_analysis(analysis, interval=5.0):
    
    logger.debug("analysis_manager.tasks run_analysis called")
    
    analysis_status = AnalysisStatus.objects.get(analysis=analysis)
    
    # updating status of analysis to running
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    analysis.status = Analysis.RUNNING_STATUS
    analysis.save()
    
    # DOWNLOADING
    # GETTING LIST OF DOWNLOADED REMOTE FILES 
    datainputs = analysis.workflow_data_input_maps.all()
    download_tasks = []
  
    for files in datainputs:
        cur_node_uuid = files.data_uuid
        cur_fs_uuid = Node.objects.get( uuid=cur_node_uuid ).file_uuid
            
        # Adding downloading task if file is not remote
        if not is_local(cur_fs_uuid):
            # getting the current file_uuid from the given node_uuid
            task_id = import_file.subtask((cur_fs_uuid, False,))
            download_tasks.append(task_id)
            
                
    # PREPROCESSING            
    task_id = run_analysis_preprocessing.subtask( (analysis,) ) 
    download_tasks.append(task_id)
    result_chord, result_set = progress_chord(download_tasks)(chord_execution.subtask(analysis=analysis,))
    # DEBUG
    #result_chord, result_set = progress_chord(download_tasks)(emptyTask.subtask())
    
    # saving preprocessing taskset
    analysis_status.preprocessing_taskset_id = result_set.task_id 
    analysis_status.save()
    
    return

# task: perform postprocessing (innermost task, does the actual work)
@task()
def run_analysis_preprocessing(analysis):
    logger.debug("analysis_manager.run_analysis_preprocessing called")
    
    # obtain expanded workflow
    connection = get_analysis_connection(analysis)
    
    # creates new library in galaxy
    library_id = connection.create_library(Site.objects.get_current().name + " Analysis - " + str(analysis.uuid) + " (" + str(datetime.now()) + ")");
    
    ### generates same ret_list purely based on analysis object ###
    ret_list = get_analysis_config(analysis)
    
    # getting expanded workflow configured based on input: ret_list
    new_workflow, history_download, analysis_node_connections = configure_workflow(analysis.workflow, ret_list, connection)
    
    # import connections into database
    for analysis_node_connection in analysis_node_connections:
        
        # lookup node object
        if ( analysis_node_connection["node_uuid"] ):
            node = Node.objects.get(uuid=analysis_node_connection["node_uuid"])
        else:
            node = None 

        AnalysisNodeConnection.objects.create(analysis=analysis,
                                              subanalysis=analysis_node_connection['subanalysis'],
                                              node=node,
                                              step=int(analysis_node_connection['step']),
                                              name=analysis_node_connection['name'],
                                              filename=analysis_node_connection['filename'],
                                              filetype=analysis_node_connection['filetype'],
                                              direction=analysis_node_connection['direction'],
                                              is_refinery_file=analysis_node_connection['is_refinery_file'])
    
    # saving ouputs of workflow to download 
    for file_dl in history_download:
        temp_dl = WorkflowFilesDL(step_id=file_dl['step_id'], pair_id=file_dl['pair_id'], filename=file_dl['name'])
        temp_dl.save()
        analysis.workflow_dl_files.add( temp_dl ) 
        analysis.save()
            
    # import newly generated workflow 
    new_workflow_info = connection.import_workflow(new_workflow);
    
    ######### ANALYSIS MODEL 
    # getting number of steps for current workflow
    new_workflow_steps = countWorkflowSteps(new_workflow)
    
    # creates new history in galaxy
    history_id = connection.create_history(Site.objects.get_current().name + " Analysis - " + str(analysis.uuid) + " (" + str(datetime.now()) + ")")
    
    # updating analysis object
    analysis.workflow_copy = new_workflow
    analysis.workflow_steps_num = new_workflow_steps
    analysis.workflow_galaxy_id = new_workflow_info['id']
    analysis.library_id = library_id
    analysis.history_id = history_id
    analysis.save()
    
    return

# task: monitor workflow execution (calls subtask that does the actual work)
@task()
def monitor_analysis_execution(analysis, interval=5.0, task_id=None):    

    # required to get updated state (move out of this function) 
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    analysis_status = AnalysisStatus.objects.filter(analysis=analysis)[0]
    # number of galaxy steps associated with this analysis
    analysis_steps = analysis.workflow_steps_num
    
    # start monitoring task
    if analysis_status.execution_monitor_task_id is None:
        analysis_status.execution_monitor_task_id = monitor_analysis_execution.request.id
        analysis_status.save()
    
    connection = get_analysis_connection(analysis)
    revoke_task = False
    
    while not revoke_task:
        #logger.debug("Sleeping ... in monitor_analysis_execution")
        
        try:
            progress = connection.get_progress(analysis.history_id)
        except:
            logger.warn( 'Unable to get progress from for history ' + analysis.history_id + ' of analysis ' + analysis.name )
            continue
        
        monitor_analysis_execution.update_state(state="PROGRESS", meta=progress)
        
        #logger.debug("monitor_analysis_execution progress[workflow_state] = %s", progress["workflow_state"])
        #logger.debug("Progress:  %s", progress )
        
        if progress["workflow_state"] == "error":
            revoke_task = True
            
            # Setting state of analysis to failure
            analysis.status = Analysis.FAILURE_STATUS
            analysis.time_end = datetime.now()
            analysis.save()
            logger.debug("analysis status: %s" % analysis.status)
            send_analysis_email(analysis)
            
        elif progress["workflow_state"] == "ok":
            logger.debug("workflow message OK:  %s", progress["message"]["ok"] )
            if progress["message"]["ok"] >= analysis_steps:
                revoke_task = True
            
        if not revoke_task:
            time.sleep( interval );
        
    logger.debug("revoking/KILLING task finished monitoring task")

# task: perform execution (innermost task, does the actual work)
@task()
def run_analysis_execution(analysis):
    
    logger.debug("analysis_manager.run_analysis_execution called")
    
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    
    ######################
    ### EXECUTION ###
    ######################
    connection = get_analysis_connection(analysis)
    
    ### generates same ret_list purely based on analysis object ###
    ret_list = get_analysis_config(analysis)

    #### NEED TO IMPORT TO GALAXY TO GET GALAXY_IDS ###
    ret_list = import_analysis_in_galaxy(ret_list, analysis.library_id, connection)
          
    # Running workflow 
    result = connection.run_workflow(analysis.workflow_galaxy_id, ret_list, analysis.history_id, analysis.workflow.uuid)  
    
    return

@task()
def rename_analysis_results(analysis):
    """ Task for renaming files in file_store after download""" 
    logger.debug("analysis_manager.rename_analysis_results called")
    
    # rename file_store items to new name updated from galaxy file_ids 
    analysis_results = AnalysisResult.objects.filter(analysis_uuid=analysis.uuid)
    for result in analysis_results:
        # new name to load
        new_file_name = result.file_name
        
        # rename file by way of file_store
        filestore_item = rename(result.file_store_uuid, new_file_name)


# task: perform cleanup, after download of results cleanup galaxy run
@task()
def run_analysis_cleanup(analysis):
    logger.debug("analysis_manager.run_analysis_cleanup called")
    
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    
    # attach workflow outputs back to dataset isatab graph
    if analysis.workflow.type == Workflow.ANALYSIS_TYPE:
        attach_outputs_dataset(analysis)
    elif analysis.workflow.type == Workflow.DOWNLOAD_TYPE:
        attach_outputs_downloads(analysis)
    else:
        logger.warning( 'Unknown workflow type "' + analysis.workflow.type + '" in analysis "' + analysis.name + '".' )
        
    # saving when analysis is finished
    analysis.time_end = datetime.now()
    
    # if analysis was declared failure, do not send completion email
    if analysis.status != Analysis.FAILURE_STATUS:
        analysis.status = Analysis.SUCCESS_STATUS
        # save state of analysis
        analysis.save()
        logger.debug("analysis completion status: %s" % analysis.status)
        send_analysis_email(analysis)
        
    # Adding task to rename files after downloading results from history
    logger.debug("before rename_analysis_results called");
    #task_id = rename_analysis_results.subtask( (analysis,) ) 
    #cleanup_taskset.append(task_id)
    rename_analysis_results(analysis)
    logger.debug("after rename_analysis_results called")
    
    # gets current galaxy connection
    connection = get_analysis_connection(analysis)
    
    # delete workflow 
    del_workflow_id = connection.delete_workflow(analysis.workflow_galaxy_id);
    
    # delete history
    ## DEBUG CURRENTLY NOT DELETING HISTORY
    connection.delete_history(analysis.history_id)
    
    # delete_library
    connection.delete_library(analysis.library_id)
        
    return


@task()
def get_analysis_config(analysis):
    ###############################################################
    ### TEST RECREATING RET_LIST DICTIONARY FROM ANALYSIS MODEL ###
    curr_workflow = analysis.workflow
    
    # getting distinct workflow inputs
    workflow_data_inputs = curr_workflow.data_inputs.all()
    annot_inputs = {};
    for data_input in workflow_data_inputs:
        input_type = data_input.name
        annot_inputs[input_type] = None;
    
    ret_list = [];
    ret_item = copy.deepcopy(annot_inputs)
    
    temp_count = 0
    temp_len = len(annot_inputs)
    t2 = analysis.workflow_data_input_maps.all().order_by('pair_id')
    for wd in t2:
        if ret_item[wd.workflow_data_input_name] is None:
            ret_item[wd.workflow_data_input_name] = {}
            ret_item[wd.workflow_data_input_name]['pair_id'] = wd.pair_id
            ret_item[wd.workflow_data_input_name]['node_uuid'] = wd.data_uuid
            temp_count += 1
       
        if temp_count == temp_len:
            ret_list.append(ret_item)
            ret_item = copy.deepcopy(annot_inputs)
            temp_count = 0
            
    #print "ret_list"
    #print ret_list
    
    return ret_list

@task()
def import_analysis_in_galaxy(ret_list, library_id, connection):
    """
    Take workflow configuration and import files into galaxy
    assign galaxy_ids to ret_list
    """
    logger.debug("analysis_manager.tasks import_analysis_in_galaxy called")
    
    for fileset in ret_list:
        for k, v in fileset.iteritems():
            cur_item = fileset[k]
            
            # getting the current file_uuid from the given node_uuid
            curr_file_uuid = Node.objects.get( uuid=cur_item['node_uuid'] ).file_uuid
            
            # getting current filestoreitem
            curr_filestore = FileStoreItem.objects.get(uuid=curr_file_uuid)
            
            file_path = curr_filestore.get_absolute_path()
            cur_item["filepath"] = file_path
            file_id = connection.put_into_library(library_id, file_path)
            cur_item["id"] = file_id
    
    return ret_list


@task
def download_history_files(analysis) :
    """
    Download entire histories from galaxy. Getting files out of history to file store
    """
    logger.debug("analysis_manger.download_history_files called")
    
    # retrieving list of files to download for workflow
    analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    dl_files = analysis.workflow_dl_files
    
    ### creating dictionary based on files to download predetermined by workflow w/ keep operators
    dl_dict = {}
    
    for dl in dl_files.all():
        temp_dict = {}
        temp_dict['filename'] = dl.filename
        temp_dict['pair_id'] = dl.pair_id
        dl_dict[str(dl.step_id)] = temp_dict
    
    # gets current galaxy connection
    connection = get_analysis_connection(analysis)
    
    download_list = connection.get_history_file_list(analysis.history_id)
    task_list = []
    
    # Iterating through files in current galaxy history
    for results in download_list:
        
        # download file if result state is "ok"
        if results['state'] == 'ok':
            file_type = results["type"]
            curr_file_id = results['name'] 
            
            if curr_file_id in dl_dict:
                curr_dl_dict = dl_dict[curr_file_id]
                
                result_name = curr_dl_dict['filename'] + '.' + file_type
            
                # size of file defined by galaxy
                file_size = results['file_size']
                   
                # Determing tag if galaxy results should be download through http or copying files directly
                local_download = analysis.workflow.workflow_engine.instance.local_download
                
                # URL to download
                if local_download:
                    download_url = results['file_name']
                   # filestore_uuid = create(source=download_url, filetype=file_type, permanent=True)
                else:
                    download_url = connection.make_url(str(results['dataset_id']), is_data=True, key=False)
                
                # getting file_store_uuid, 
                # TODO: when changing permanent=True, fix update of % download of file 
                filestore_uuid = create(source=download_url, filetype=file_type, permanent=False)
                
                # adding history files to django model 
                temp_file = AnalysisResult(analysis_uuid=analysis.uuid, file_store_uuid=filestore_uuid, file_name=result_name, file_type=file_type)
                temp_file.save() 
                analysis.results.add(temp_file) 
                analysis.save() 
                
                # downloading analysis results into file_store
                # only download files if size is greater than 1
                if file_size > 0:
                    #task_id = import_file.subtask((filestore_uuid, True, False, file_size,))
                    # local download, force copying into the file_store instead of symlinking
                    if local_download:
                        task_id = import_file.subtask((filestore_uuid, False, True, file_size,))
                    else:
                        task_id = import_file.subtask((filestore_uuid, False, False, file_size,))
                    task_list.append(task_id)
            
    return task_list
        
        
@task()
def get_analysis_connection(analysis): 
    """
    gets current connection based on workflow engine associated with imported workflows
    """
    
    cur_workflow = analysis.workflow
    
    connection = Connection(cur_workflow.workflow_engine.instance.base_url,
                             cur_workflow.workflow_engine.instance.data_url,
                             cur_workflow.workflow_engine.instance.api_url,
                             cur_workflow.workflow_engine.instance.api_key)
    return connection


def attach_outputs_downloads(analysis):
    analysis_results = AnalysisResult.objects.filter(analysis_uuid=analysis.uuid)

    if analysis_results.count() == 0:
        logger.error( 'No results for download "' + analysis.name + '" (' + analysis.uuid + ')' )
        return
    
    for analysis_result in analysis_results:
        item = FileStoreItem.objects.get( uuid=analysis_result.file_store_uuid )
        
        if item:
            download = Download.objects.create( name=analysis.name, data_set=analysis.data_set, file_store_item=item )
            download.set_owner( analysis.get_owner() )            
        else:             
            logger.warning( 'No file found for "' + analysis_result.file_store_uuid + '" in download "' + analysis.name + '" (' + analysis.uuid + ')' )
        


def attach_outputs_dataset(analysis):
    
    # ----------------------------------------------------------------------------------------
    # for testing: attach workflow graph and output files to data set graph
    # ----------------------------------------------------------------------------------------
    #analysis = Analysis.objects.filter(uuid=analysis.uuid)[0]
    
        
    # 0. get study and assay from the first input node
    study = AnalysisNodeConnection.objects.filter( analysis=analysis, direction=INPUT_CONNECTION )[0].node.study;
    assay = AnalysisNodeConnection.objects.filter( analysis=analysis, direction=INPUT_CONNECTION )[0].node.assay;
    
    # 1. read workflow into graph
    graph = create_expanded_workflow_graph(ast.literal_eval(analysis.workflow_copy))
    
    # 2. create data transformation nodes for all tool nodes
    data_transformation_nodes = [graph.node[node_id] for node_id in graph.nodes() if graph.node[node_id]['type'] == "tool"]
    for data_transformation_node in data_transformation_nodes:
        # TODO: incorporate subanalysis id in tool name???
        data_transformation_node['node'] = Node.objects.create(study=study, assay=assay, analysis_uuid=analysis.uuid, type=Node.DATA_TRANSFORMATION, name=data_transformation_node['tool_id'] + '_' + data_transformation_node['name'])

    # 3. create connection from input nodes to first data transformation nodes (input tool nodes in the graph are skipped)
    for input_connection in AnalysisNodeConnection.objects.filter( analysis=analysis, direction=INPUT_CONNECTION ):
        for edge in graph.edges_iter([input_connection.step]):
            if graph[edge[0]][edge[1]]['output_id'] == str(input_connection.step) + '_' + input_connection.filename:
                input_node_id = edge[1];                
                data_transformation_node = graph.node[input_node_id]['node']        
                input_connection.node.add_child(data_transformation_node)

    # 4. create derived data file nodes for all entries and connect to data transformation nodes
    for output_connection in AnalysisNodeConnection.objects.filter( analysis=analysis, direction=OUTPUT_CONNECTION ):
        # create derived data file node
        derived_data_file_node = Node.objects.create(study=study, assay=assay, type=Node.DERIVED_DATA_FILE, name=output_connection.name, analysis_uuid=analysis.uuid, subanalysis=output_connection.subanalysis, workflow_output=output_connection.name )

        # retrieve uuid of corresponding output file if exists
        print "Results for " + analysis.uuid + " and " + output_connection.filename + "." + output_connection.filetype + ": " + str( AnalysisResult.objects.filter(analysis_uuid=analysis.uuid,file_name=(output_connection.name + "." + output_connection.filetype) ).count() )
        analysis_results = AnalysisResult.objects.filter(analysis_uuid=analysis.uuid,file_name=(output_connection.name + "." + output_connection.filetype) )

        if analysis_results.count() == 0:
            logger.info( 'No output file found for node "' + derived_data_file_node.name + '" (' + derived_data_file_node.uuid + ')' )
        
        if analysis_results.count() == 1:
            derived_data_file_node.file_uuid = analysis_results[0].file_store_uuid
            logger.debug( 'Output file "' + output_connection.name + "." + output_connection.filetype + '" (' + analysis_results[0].file_store_uuid + ') assigned to node "' + derived_data_file_node.name + '" (' + derived_data_file_node.uuid + ')' )
            
        if analysis_results.count() > 1:
            logger.warning( 'Multiple output files returned for "' + output_connection.filename + "." + output_connection.filetype + '". No assignment to output node was made.' )
        
        output_connection.node = derived_data_file_node
        output_connection.save() 
        
        # get graph edge that corresponds to this output node:
        # a. attach output node to source data transformation node
        # b. attach output node to target data transformation node (if exists)
        if len( graph.edges([output_connection.step]) ) > 0:
            for edge in graph.edges_iter([output_connection.step]):
                if graph[edge[0]][edge[1]]['output_id'] == str(output_connection.step) + "_" + output_connection.filename:
                    output_node_id = edge[0];
                    input_node_id = edge[1];                
                    data_transformation_output_node = graph.node[output_node_id]['node']        
                    data_transformation_input_node = graph.node[input_node_id]['node']        
                    data_transformation_output_node.add_child(derived_data_file_node)
                    derived_data_file_node.add_child(data_transformation_input_node)        
                    # TODO: here we could add a (Refinery internal) attribute to the derived data file node to indicate which output of the tool it corresponds to
                    
        # connect outputs that are not inputs for any data transformation
        if output_connection.is_refinery_file and derived_data_file_node.parents.count() == 0:
            graph.node[output_connection.step]['node'].add_child( derived_data_file_node ) 

        # delete output nodes that are not refinery files and don't have any children
        if not output_connection.is_refinery_file and derived_data_file_node.children.count() == 0:
            output_connection.node.delete()
        
    # 5. create annotated nodes and index new nodes
    node_uuids = AnalysisNodeConnection.objects.filter(analysis=analysis, direction=OUTPUT_CONNECTION, is_refinery_file=True).values_list('node__uuid', flat=True)
    add_annotated_nodes_selection( node_uuids, Node.DERIVED_DATA_FILE, study.uuid, assay.uuid )
    index_annotated_nodes_selection( node_uuids )
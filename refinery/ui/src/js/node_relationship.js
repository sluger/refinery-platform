angular.module('refineryNodeRelationship', [
  'ngResource',
])

.factory('nodeRelationshipResource', function($resource) {
  'use strict';

  return $resource(
    "/api/v1/noderelationship/:uuid/", {
      format: "json",
    }, 
    {
      'update': { method:'PUT' },
      'update_partial': { method:'PATCH' }
    }
  );
})

.factory("nodePairResource", function($resource, $http) {
  'use strict';

  return $resource(
    '/api/v1/nodepair/:uuid/', {
      format: 'json'
    },
    {
      // use different url (from: https://github.com/angular/angular.js/pull/2054) - 
      'load_from_uri': { method: 'GET', url: "/:uri", params: { "format": "json" } }
    }
  );
})

.service( 'nodeRelationshipService', function($log, nodeRelationshipResource) {

  var createCurrentNodeRelationship = function( name, type, success, error ) {
    _createNodeRelationship( name, type, "", true, success, error );
  };

  var createNodeRelationship = function( name, summary, type, success, error ) {
    _createNodeRelationship( name, summary, type, false, success, error );
  };

  var _createNodeRelationship = function( name, summary, type, is_current, success, error ) {
    //internal method -- call createNodeRelationship or createCurrentNodeRelationship

    var resource = new nodeRelationshipResource( {study: "/api/v1/study/" + externalStudyUuid + "/", assay: "/api/v1/assay/" + externalAssayUuid + "/", node_pairs: [], name: name, summary: summary, type: type, is_current: is_current } );

    resource.$save( success, error );
  };

  var deleteNodeRelationship = function( nodeRelationship, success, error ) {
    $log.debug( "Deleting node relationship " + nodeRelationship.name + " ..." );
    if ( nodeRelationship.is_current ) {
      $log.error( "Cannot delete current node relationship." );
    }
    else {
      nodeRelationshipResource.delete( { uuid: nodeRelationship.uuid }, success, error );
    }
  };

  return ({
    createCurrentNodeRelationship: createCurrentNodeRelationship,
    createNodeRelationship: createNodeRelationship,
    deleteNodeRelationship: deleteNodeRelationship
  });
})

.controller('NodeRelationshipListCtrl', function($scope, $rootScope, $element, $log, $modal, nodeRelationshipResource, nodeRelationshipService ) {
  'use strict';

  $scope.$onRootScope('workflowChangedEvent', function( event, currentWorkflow ) {
    $scope.currentWorkflow = currentWorkflow;

    $scope.currentNodeRelationship = null;

    $rootScope.$emit("nodeRelationshipChangedEvent", $scope.currentNodeRelationship, undefined );
  });  

  $scope.$onRootScope('nodeRelationshipChangedEvent', function( event, currentNodeRelationship, index ) {
    $scope.nodeRelationshipIndex = index;

    $log.debug( index );
    $log.debug( $scope.nodeRelationshipList );
  });

  var successDelete = function( response ) {
    $log.debug( response );
    $log.debug( "Successfully deleted " + response.name );
    
    $scope.currentNodeRelationship = null;
    $scope.nodeRelationshipIndex = 0;
    $scope.loadNodeRelationshipList( externalStudyUuid, externalAssayUuid );
    // update the current node relationship (fires event)
    $scope.updateCurrentNodeRelationship();
  };

  var successCreate = function( response ) {
    // add new current mapping to list
    //$scope.nodeRelationshipList.unshift( response );
    //$scope.currentNodeRelationship = response;
    // update the current node relationship (fires event)
    $scope.nodeRelationshipIndex = 0;
    $scope.loadNodeRelationshipList( externalStudyUuid, externalAssayUuid );
    $scope.updateCurrentNodeRelationship();

  };

  $scope.loadNodeRelationshipList = function( studyUuid, assayUuid ) {
    return nodeRelationshipResource.get(
        {study__uuid: studyUuid, assay__uuid: assayUuid, order_by: [ "-is_current", "name" ] },
        function( response ) {
          // check if there is a "current mapping" in the list (this would be the first entry due to the ordering)
          if ( ( ( response.objects.length > 0 ) && ( !response.objects[0].is_current ) ) || ( response.objects.length === 0 ) ) {
            $scope.createCurrentNodeRelationship( "Current Mapping", "1-N" );
          }

          $scope.nodeRelationshipList = response.objects;
          $log.debug( "# of node relationships: " + $scope.nodeRelationshipList.length );
      });    
  };

  $scope.updateCurrentNodeRelationship = function() {
    $scope.currentNodeRelationship = $scope.nodeRelationshipList[$scope.nodeRelationshipIndex];  
    // FIXME: temp workaround - this should be handled through the event bus
    if ($scope.currentNodeRelationship) {
      $rootScope.$emit("nodeRelationshipChangedEvent", $scope.currentNodeRelationship, $scope.nodeRelationshipIndex);
    }
  };  


  $scope.openNewMappingDialog = function() {
    $scope.newMappingDialogConfig = { title: 'New File Mapping', text: 'Enter a name for the mapping.', val: 'New Mapping' };

    var modalInstance = $modal.open({
      templateUrl: '/static/partials/input_dialog.tpls.html',
      controller: InputDialogInstanceController,
      resolve: {
        config: function () {
          return $scope.newMappingDialogConfig;
        }
      }
    });

    modalInstance.result.then(function (val) {
      $scope.val = val;
      nodeRelationshipService.createNodeRelationship( val, "Test", "1-N", successCreate, function( response ){ alert( "Error!" ); console.log( response ); } );
    }, function () {
      $log.info('Modal dismissed at: ' + new Date());
    });
  };

  $scope.openRenameMappingDialog = function( nodeRelationship ) {
    $scope.renameMappingDialogConfig = { title: 'Rename File Mapping', text: 'Enter a new name for the mapping "' + nodeRelationship.name + '".', val:  nodeRelationship.name };

    var modalInstance = $modal.open({
      templateUrl: '/static/partials/input_dialog.tpls.html',
      controller: InputDialogInstanceController,
      resolve: {
        config: function () {
          return $scope.renameMappingDialogConfig;
        }
      }
    });

    modalInstance.result.then(function (val) {
      $scope.val = val;
      nodeRelationship.name = val;
      nodeRelationshipResource.update({uuid: nodeRelationship.uuid}, nodeRelationship, function( response ){ $log.debug( "Success!" ); $log.debug( response ); }, function( response ){ $log.error( "Error!" ); $log.error( response ); });
    }, function () {
      $log.info('Modal dismissed at: ' + new Date());
    });
  };


  $scope.openDeleteMappingDialog = function( nodeRelationship ) {
    $scope.newDeleteMappingDialogConfig = { title: 'Delete File Mapping?', text: 'Are you sure you want to delete the file mapping "' + nodeRelationship.name + '"?' };

    var modalInstance = $modal.open({
      templateUrl: '/static/partials/confirmation_dialog.tpls.html',
      controller: ConfirmationDialogInstanceController,
      resolve: {
        config: function () {
          return $scope.newDeleteMappingDialogConfig;
        }
      }
    });

    modalInstance.result.then(function () {
      nodeRelationshipService.deleteNodeRelationship( nodeRelationship, successDelete, function( response ){ $log.error( "Error!" ); $log.error( response ); } );
    }, function () {
      $log.info('Modal dismissed at: ' + new Date());
    });
  };

  var NodeRelationshipList =  $scope.loadNodeRelationshipList( externalStudyUuid, externalAssayUuid );
});

var InputDialogInstanceController = function ($scope, $modalInstance, config ) {
  $scope.config = config;
  $scope.val = {
    val: $scope.config.val
  };

  $scope.ok = function () {
    $modalInstance.close($scope.config.val);
  };

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
};

var ConfirmationDialogInstanceController = function ($scope, $modalInstance, config ) {
  $scope.config = config;

  $scope.ok = function () {
    $modalInstance.close();
  };

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
};


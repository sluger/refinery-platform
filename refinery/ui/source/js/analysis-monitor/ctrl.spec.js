/** Unit Tests **/

//Global variable for both test and ctrl.
var dataSetUuid = 'x508x83x-x9xx-4740-x9x7-x7x0x631280x';

describe('Controller: AnalysisMonitorCtrl', function(){
  var ctrl,
      scope,
      factory,
      valid_uuid = 'x508x83x-x9xx-4740-x9x7-x7x0x631280x',
      invalid_uuid = 'xxxxx';

  beforeEach(module('refineryApp'));
  beforeEach(module('refineryAnalysisMonitor'));
  beforeEach(inject(function($rootScope, _$controller_, _analysisMonitorFactory_) {
    scope = $rootScope.$new();
    $controller = _$controller_;
    ctrl = $controller('AnalysisMonitorCtrl', {$scope: scope});
    factory = _analysisMonitorFactory_;
  }));

  it('AnalysisMonitorCtrl ctrl should exist', function() {
    expect(ctrl).toBeDefined();
  });

  it('Data & UI displays variables should exist for views', function() {
    expect(ctrl.analysesList).toEqual([]);
    expect(ctrl.analysesGlobalList).toEqual([]);
    expect(ctrl.analysesDetail).toEqual({});
    expect(ctrl.analysesGlobalDetail).toEqual({});
    expect(ctrl.analysesRunningList).toEqual([]);
    expect(ctrl.analysesRunningGlobalList).toEqual([]);
    expect(ctrl.launchAnalysisFlag).toBeDefined();
    expect(ctrl.analysesRunningGlobalListCount).toBeDefined();
    expect(ctrl.analysesLoadingFlag).toBeDefined();
    expect(ctrl.analysesGlobalLoadingFlag).toBeDefined();
    expect(ctrl.initializedFlag).toBeDefined();
  });

  describe('Update Analyse Lists from Factory', function(){
    var $timeout;

    beforeEach(inject(function(_$timeout_, _$q_) {
       $timeout = _$timeout_;
      $q = _$q_;
    }));

    afterEach(function() {
      $timeout.cancel(ctrl.timerList);
      $timeout.cancel(ctrl.timerGlobalList);
      $timeout.cancel(ctrl.timerRunGlobalList);
      $timeout.cancel(ctrl.timerRunList);
    });

    it("updateAnalysesList is method", function(){
      expect(angular.isFunction(ctrl.updateAnalysesList)).toBe(true);
    });

    it("updateAnalysesList sets timer and returns promise", function(){
      var mockAnalysesFlag = false;
      spyOn(factory, "getAnalysesList").and.callFake(function() {
        return {
          then: function () {
            mockAnalysesFlag = true;
          }
        };
      });

      expect(typeof ctrl.timerList).toEqual('undefined');
      ctrl.updateAnalysesList();
      expect(typeof ctrl.timerList).toBeDefined();
      expect(mockAnalysesFlag).toEqual(true);
    });

    it("updateAnalysesGlobalList is  method", function(){
      expect(angular.isFunction(ctrl.updateAnalysesGlobalList)).toBe(true);
    });

    it("updateAnalysesGlobalList sets timer and returns promise", function(){
      var mockAnalysesGlobalFlag = false;
      spyOn(factory, "getAnalysesList").and.callFake(function() {
        return {
          then: function () {
            mockAnalysesGlobalFlag = true;
          }
        };
      });

      expect(typeof ctrl.timerGlobalList).toEqual('undefined');
      ctrl.updateAnalysesGlobalList();
      expect(typeof ctrl.timerGlobalList).toBeDefined();
      expect(mockAnalysesGlobalFlag).toEqual(true);
    });

    it("updateAnalysesRunningGlobalList is method", function(){
      expect(angular.isFunction(ctrl.updateAnalysesRunningGlobalList)).toBe(true);
    });

    it("updateAnalysesRunningList sets timer and returns promise", function(){
      var mockAnalysesRunningFlag = false;
      spyOn(factory, "getAnalysesList").and.callFake(function() {
        return {
          then: function () {
            mockAnalysesRunningFlag = true;
          }
        };
      });

      expect(typeof ctrl.timerRunList).toEqual('undefined');
      ctrl.updateAnalysesRunningList();
      expect(typeof ctrl.timerRunList).toBeDefined();
      expect(mockAnalysesRunningFlag).toEqual(true);
    });

    it("updateAnalysesRunningGlobalList is method", function(){
      expect(angular.isFunction(ctrl.updateAnalysesRunningGlobalList)).toBe(true);
    });

    it("updateAnalysesRunningGlobalList sets timer and returns promise", function(){
      var mockAnalysesRunningGlobalFlag = false;
      spyOn(factory, "getAnalysesList").and.callFake(function() {
        return {
          then: function () {
            mockAnalysesRunningGlobalFlag = true;
          }
        };
      });

      expect(typeof ctrl.timerRunGlobalList).toEqual('undefined');
      ctrl.updateAnalysesRunningGlobalList();
      expect(typeof ctrl.timerRunGlobalList).toBeDefined();
      expect(mockAnalysesRunningGlobalFlag).toEqual(true);
    });

  });

  describe('Canceling Analyses', function(){
    var mockCancelFlag = false;

    beforeEach(inject(function() {

      spyOn(factory, "postCancelAnalysis").and.callFake(function() {
        return {
          then: function () {
            mockCancelFlag = true;
          }
        };
      });

      ctrl.analysesDetail[valid_uuid] = {
          "refineryImport": [{status: "PROGRESS", percent_done: 30}],
          "galaxyImport": [{status: "", percent_done: ""}],
          "galaxyAnalysis": [{status: "", percent_done:""}],
          "galaxyExport": [{status: "", percent_done: ""}],
          "overrall": "RUNNING"
        };
     }));

    it("cancelAnalysis and setCancelAnalysisFlag are methods", function(){
      expect(angular.isFunction(ctrl.cancelAnalysis)).toBe(true);
      expect(angular.isFunction(ctrl.setCancelAnalysisFlag)).toBe(true);
    });

    it("cancelAnalysis, check postCancelAnalysis is called", function(){
      expect(mockCancelFlag).toEqual(false);
      ctrl.cancelAnalysis(valid_uuid);
      expect(mockCancelFlag).toEqual(true);
    });

    it("setCancelAnalysisFlag", function(){
      response = ctrl.setCancelAnalysisFlag(true, invalid_uuid);
      expect(ctrl.initializedFlag[invalid_uuid]).toEqual(true);

      response = ctrl.setCancelAnalysisFlag(false, valid_uuid);
      expect(ctrl.analysesDetail[valid_uuid].cancelingAnalyses).toEqual(false);

      response = ctrl.setCancelAnalysisFlag(true, valid_uuid);
      expect(ctrl.analysesDetail[valid_uuid].cancelingAnalyses).toEqual(true);

    });
  });

  describe('Helper functions', function(){

    beforeEach(inject(function($rootScope, _$timeout_){
      scope = $rootScope.$new();
      $timeout = _$timeout_;

      ctrl.analysesDetail[valid_uuid]={
            "refineryImport": [{status: "PROGRESS", percent_done: 30}],
            "galaxyImport": [{status: "", percent_done: ""}],
            "galaxyAnalysis": [{status: "", percent_done:""}],
            "galaxyExport": [{status: "", percent_done: ""}],
            "overrall": "RUNNING"
          };
    }));

    it("refreshAnalysesDetail method is function", function(){
      expect(angular.isFunction(ctrl.refreshAnalysesDetail)).toBe(true);
    });

    it("refreshAnalysesDetail method calls update Analyses Detail", function(){
      factory.analysesRunningList = [
        {uuid: "xxx0"},
        {uuid: "xxx1"},
        {uuid: "xxx2"}
      ];
      spyOn(ctrl, 'updateAnalysesDetail').and.returnValue(true);
      ctrl.refreshAnalysesDetail();
      expect(ctrl.analysesRunningList).toEqual(factory.analysesRunningList);
      expect(ctrl.updateAnalysesDetail.calls.count())
        .toEqual(factory.analysesRunningList.length);
    });

    it("refreshAnalysesGlobalDetail method is function", function(){
      expect(angular.isFunction(ctrl.refreshAnalysesGlobalDetail)).toBe(true);
    });

    it("refreshAnalysesGlobalDetail method calls update Analyses Detail", function(){
      factory.analysesRunningGlobalList = [
        {uuid: "xxx0"},
        {uuid: "xxx1"},
        {uuid: "xxx2"}
      ];
      spyOn(ctrl, 'updateAnalysesGlobalDetail').and.returnValue(true);
      ctrl.refreshAnalysesGlobalDetail();
      expect(ctrl.analysesRunningGlobalList).toEqual(factory.analysesRunningGlobalList);
      expect(ctrl.updateAnalysesGlobalDetail.calls.count())
        .toEqual(factory.analysesRunningGlobalList.length);
    });

    it("updateAnalysesDetail method is function", function(){
      expect(angular.isFunction(ctrl.updateAnalysesDetail)).toBe(true);
    });

    it("updateAnalysesGlobalDetail method is function", function(){
      expect(angular.isFunction(ctrl.updateAnalysesGlobalDetail)).toBe(true);
    });

    it("cancelTimerGlobalList method is function", function(){
      expect(angular.isFunction(ctrl.cancelTimerGlobalList)).toBe(true);
    });

    it("cancelTimerGlobalList method cancel timerGlobalList", function(){
      ctrl.timerGlobalList = $timeout(10);
      expect(typeof ctrl.timerGlobalList.$$state.value).toEqual('undefined');
      ctrl.cancelTimerGlobalList();
      expect(ctrl.timerGlobalList.$$state.value).toEqual('canceled');
    });

    it("cancelTimerRunningList method is function", function(){
      expect(angular.isFunction(ctrl.cancelTimerRunningList)).toBe(true);
    });

    it("cancelTimerRunningList method cancel timerRunList", function(){
      ctrl.timerRunList = $timeout(10);
      expect(typeof ctrl.timerRunList.$$state.value).toEqual('undefined');
      ctrl.cancelTimerRunningList();
      expect(ctrl.timerRunList.$$state.value).toEqual('canceled');
    });

    it("cancelTimerRunningGlobalList method is function", function(){
      expect(angular.isFunction(ctrl.cancelTimerRunningGlobalList)).toBe(true);
    });

     it("cancelTimerRunningGlobalList method cancel timerRunGlobalList", function(){
      ctrl.timerRunGlobalList = $timeout(10);
      expect(typeof ctrl.timerRunGlobalList.$$state.value).toEqual('undefined');
      ctrl.cancelTimerRunningGlobalList();
      expect(ctrl.timerRunGlobalList.$$state.value).toEqual('canceled');
    });

    it("setAnalysesLoadingFlag method is function", function(){
      expect(angular.isFunction(ctrl.setAnalysesLoadingFlag)).toBe(true);
    });

    it("setAnalysesLoadingFlag responds correctly", function(){
      //Default of analysesList should be 0.
      ctrl.setAnalysesLoadingFlag();
      expect(ctrl.analysesLoadingFlag).toEqual("EMPTY");

      ctrl.analysesList = [{},{},{}];
      ctrl.setAnalysesLoadingFlag();
      expect(ctrl.analysesLoadingFlag).toEqual("DONE");
    });

    it("setAnalysesGlobalLoadingFlag method is function", function(){
      expect(angular.isFunction(ctrl.setAnalysesGlobalLoadingFlag)).toBe(true);
    });

    it("setAnalysesGlobalLoadingFlag responds correctly", function(){
      //Default of analysesList should be 0.
      ctrl.setAnalysesGlobalLoadingFlag();
      expect(ctrl.analysesGlobalLoadingFlag).toEqual("EMPTY");

      ctrl.analysesGlobalList = [{},{},{}];
      ctrl.setAnalysesGlobalLoadingFlag();
      expect(ctrl.analysesGlobalLoadingFlag).toEqual("DONE");
    });

    it("isAnalysesRunning method is function", function(){
      expect(angular.isFunction(ctrl.isAnalysesRunning)).toBe(true);
    });

    it("isAnalysesRunning responds correctly", function(){
      ctrl.analysesRunningList = undefined;
      var response_invalid = ctrl.isAnalysesRunning();
      expect(response_invalid).toEqual(false);

      ctrl.analysesRunningList = [{},{},{}];
      var response_valid = ctrl.isAnalysesRunning();
      expect(response_valid).toEqual(true);
    });

    it("isAnalysesRunningGlobal method is function", function(){
       expect(angular.isFunction(ctrl.isAnalysesRunningGlobal)).toBe(true);
    });

    it("isAnalysesRunningGlobal responds correctly", function(){
      ctrl.analysesRunningGlobalList = undefined;
      var response_invalid = ctrl.isAnalysesRunningGlobal();
      expect(response_invalid).toEqual(false);

      ctrl.analysesRunningGlobalList = [{},{},{}];
      var response_valid = ctrl.isAnalysesRunningGlobal();
      expect(response_valid).toEqual(true);
    });

    it("isEmptyAnalysesGlobalList method is function", function(){
       expect(angular.isFunction(ctrl.isEmptyAnalysesGlobalList)).toBe(true);
    });

    it("isEmptyAnalysesGlobalList responds correctly", function(){
      ctrl.analysesRunningList = undefined;
      var response_invalid = ctrl.isEmptyAnalysesGlobalList();
      expect(response_invalid).toEqual(true);

      ctrl.analysesRunningList = [{},{},{}];
      ctrl.analysesGlobalList = [{},{},{}];
      var response_valid = ctrl.isEmptyAnalysesGlobalList();
      expect(response_valid).toEqual(false);
    });

    it("isAnalysisDetailLoaded method is function", function(){
       expect(angular.isFunction(ctrl.isAnalysisDetailLoaded)).toBe(true);
    });

    it("isAnalysisDetailLoaded responds correctly", function(){
      var response_valid = ctrl.isAnalysisDetailLoaded(valid_uuid);
      expect(response_valid).toEqual(true);
      var response_invalid = ctrl.isAnalysisDetailLoaded(invalid_uuid);
      expect(response_invalid).toEqual(false);
    });

  });

});

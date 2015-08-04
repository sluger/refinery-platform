angular.module('refineryAnalyses')
    .controller('AnalysesCtrl',
    ['analysesFactory', 'analysesAlertService','$scope','$timeout', '$rootScope', AnalysesCtrl]);


function AnalysesCtrl(analysesFactory, analysesAlertService, $scope, $timeout, $rootScope) {
  "use strict";
  var vm = this;
  vm.analysesList = [];
  vm.analysesGlobalList = [];
  vm.analysesDetail = {};
  vm.analysesGlobalDetail = {};
  vm.analysesRunningList = [];
  vm.analysesRunningGlobalList = [];
  vm.timerRunGlobalList = undefined;
  vm.timerGlobalList = undefined;
  vm.timerRunList = undefined;

  vm.updateAnalysesList = function () {
    analysesFactory.getAnalysesList().then(function () {
      vm.analysesList = analysesFactory.analysesList;
      vm.refreshAnalysesDetail();
    });

    var timerList =  $timeout(vm.updateAnalysesList, 30000);

    $scope.$on('refinery/analyze-tab-inactive', function(){
      $timeout.cancel(timerList);
    });
  };

  vm.updateAnalysesGlobalList = function () {
    analysesFactory.getAnalysesGlobalList().then(function () {
      vm.analysesGlobalList = analysesFactory.analysesGlobalList;
      vm.refreshAnalysesGlobalDetail();
    });
   vm.timerGlobalList = $timeout(vm.updateAnalysesGlobalList, 30000);
  };

  vm.cancelTimerGlobalList = function(){
    if(typeof vm.timerGlobalList !== "undefined") {
      $timeout.cancel(vm.timerGlobalList);
    }
  };

  vm.updateAnalysesRunningList = function () {
    console.log('running list request');
    analysesFactory.getAnalysesRunningList().then(function () {
      vm.analysesRunningList = analysesFactory.analysesRunningList;
      console.log('running list request FULLFILLED');
      console.log(vm.analysesRunningList);
    });

    vm.timerRunList = $timeout(vm.updateAnalysesRunningList, 30000);

    if(typeof dataSetUuid === 'undefined' || dataSetUuid === "None"){
      $timeout.cancel(vm.timerRunList);
    }
  };

  vm.updateAnalysesRunningGlobalList = function () {
    console.log('running global list request');
    analysesFactory.getAnalysesRunningGlobalList().then(function () {
      vm.analysesRunningGlobalList = analysesFactory.analysesRunningGlobalList;
      console.log('running global list request FULLFILLED');
      console.log(vm.analysesRunningGlobalList);
    });
    vm.timerRunGlobalList = $timeout(vm.updateAnalysesRunningGlobalList, 30000);

    if(typeof dataSetUuid === 'undefined' || dataSetUuid === "None"){
      $timeout.cancel(vm.timerRunList);
    }
  };

  vm.cancelTimerRunningList = function(){
    if(typeof vm.timerRunList !== "undefined") {
      $timeout.cancel(vm.timerRunList);
      console.log("canceltimerrunninglist");
    }
  };

  vm.cancelTimerRunningGlobalList = function(){
    if(typeof vm.timerRunGlobalList !== "undefined") {
      $timeout.cancel(vm.timerRunGlobalList);
      console.log("canceltimerrunninglist");
    }
  };

  vm.refreshAnalysesDetail = function () {
    vm.analysesRunningList = analysesFactory.analysesRunningList;
    for (var i = 0; i < vm.analysesRunningList.length; i++) {
      vm.updateAnalysesDetail(i);
    }
  };

  vm.refreshAnalysesGlobalDetail = function(){
    vm.analysesRunningGlobalList = analysesFactory.analysesRunningGlobalList;
    for (var i = 0; i < vm.analysesRunningGlobalList.length; i++) {
      vm.updateAnalysesGlobalDetail(i);
    }
  };

  vm.updateAnalysesDetail = function (i) {
    (function (i) {
      if(typeof vm.analysesRunningList[i] !== 'undefined') {
        analysesFactory.getAnalysesDetail(vm.analysesRunningList[i].uuid).then(function (response) {
          vm.analysesDetail[vm.analysesRunningList[i].uuid] = analysesFactory.analysesDetail[vm.analysesRunningList[i].uuid];
        });
      }
    })(i);
  };

  vm.updateAnalysesGlobalDetail = function (i) {
    (function (i) {
      if(typeof vm.analysesRunningGlobalList[i] !== 'undefined') {
        analysesFactory.getAnalysesDetail(vm.analysesRunningGlobalList[i].uuid).then(function (response) {
          vm.analysesGlobalDetail[vm.analysesRunningGlobalList[i].uuid] = analysesFactory.analysesDetail[vm.analysesRunningGlobalList[i].uuid];
        });
      }
    })(i);
  };

  vm.cancelAnalysis = function (uuid) {
    vm.analysesDetail[uuid].cancelingAnalyses = true;
    analysesFactory.postCancelAnalysis(uuid).then(function (result) {
      bootbox.alert("Successfully canceled analysis.");
      vm.analysesDetail[uuid].cancelingAnalyses = false;
      $rootScope.$broadcast("rf/cancelAnalysis");
    }, function (error) {
      bootbox.alert("Canceling analysis failed");
      vm.analysesDetail[uuid].cancelingAnalyses = false;
    });
  };

  //Alert message which show on analysis view filtered page
  vm.setAnalysesAlertMsg = function () {
    var uuid = window.analysisUuid;
    analysesAlertService.setAnalysesMsg(uuid);
    vm.analysesMsg = analysesAlertService.getAnalysesMsg();
  };

  vm.isAnalysesRunning = function () {
    console.log("in is analyses running");
    console.log(vm.analysesRunningList.length);
    if (vm.analysesRunningList.length > 0) {
      return true;
    } else {
      return false;
    }
  };

  vm.isAnalysesRunningGlobal = function () {
    console.log("in is analyses global running");
    console.log(vm.analysesRunningGlobalList.length);
    if(vm.analysesRunningGlobalList.length > 0) {
      return true;
    } else {
      return false;
    }
  };

  vm.isEmptyAnalysesGlobalList = function(){
    if(vm.analysesGlobalList.length > 0){
      return false;
    }else{
      return true;
    }
  };

  vm.isAnalysesRunningGlobal = function(){
    if(vm.analysesRunningGlobalList.length>0){
      return true;
    }else{
      return false;
    }
  };

  vm.isAnalysisDetailLoaded = function(uuid){
    if(typeof vm.analysesDetail[uuid] !== "undefined" && vm.analysesDetail[uuid].preprocessing !== ""){
      return true;
    }else{
      return false;
    }
  };

  vm.analysesPopoverEvents = function (element) {
    $('.popover').on('mouseenter', function() {
      $rootScope.insidePopover = true;
    });
    $('.popover').on('mouseleave', function() {
      $rootScope.insidePopover = false;
      $(element).popover('hide');
      vm.cancelTimerGlobalList();
    });
  };

  //checks url to see if view is filtered by analysis in data_set.html. Used
  // with analyses alert msg.
  $scope.checkAnalysesViewFlag = function () {
    var flag;
    if (typeof window.analysisUuid === 'undefined' || window.analysisUuid === "None") {
      flag = false;
    } else {
      flag = true;
    }
    return flag;
  };

}
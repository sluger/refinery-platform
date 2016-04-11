angular.module('refineryFileBrowser')
    .controller('AssayFilesUtilModalCtrl',
    [
      '$scope',
      '$uibModalInstance',
      '$window',
      'fileBrowserFactory',
      'resetGridService',
      AssayFilesUtilModalCtrl
    ]
);


function AssayFilesUtilModalCtrl(
  $scope,
  $uibModalInstance,
  $window,
  fileBrowserFactory,
  resetGridService
){

  var vm = this;
  vm.assayAttributeOrder = [];
  $scope.assayAttributeOrder = [];
  $scope.selected = null;

  $scope.ok = function () {
  };

  $scope.cancel = function () {
    $uibModalInstance.dismiss('cancel');
  };

  $scope.close = function () {
    resetGridService.setResetGridFlag(true);
    $uibModalInstance.close('close');
  };

  $scope.testMethod = function(attributeObj, index){
    $scope.assayAttributeOrder.splice(index, 1);
    for(var i=0; i<$scope.assayAttributeOrder.length; i++){
      if($scope.assayAttributeOrder[i].solr_field === attributeObj.solr_field){
        $scope.assayAttributeOrder[i].rank = i + 1;
        vm.updateAssayAttributes($scope.assayAttributeOrder[i]);
        break;
      }
    }
  };

  vm.refreshAssayAttributes = function () {
    var assay_uuid = $window.externalAssayUuid;
    return fileBrowserFactory.getAssayAttributeOrder(assay_uuid).then(function(){
      $scope.assayAttributeOrder = fileBrowserFactory.assayAttributeOrder;
    },function(error){
      console.log(error);
    });
  };

  vm.updateAssayAttributes = function(attributeParam){
    fileBrowserFactory.postAssayAttributeOrder(attributeParam).then(function(){
      vm.refreshAssayAttributes();
    });
  };

  vm.refreshAssayAttributes();
  //$scope.view = function () {
  //  $uibModalInstance.close('view');
  //  $window.location.href = '/data_sets/' + dataSetUuid + '/#/analyses';
  //};

}

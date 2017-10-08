function SmartPaymentsConfig($stateProvider) {
    'ngInject';

    $stateProvider
        .state('app.smartPayments', {
            url: '/smart-payments',
            controller: 'SmartPaymentsCtrl',
            controllerAs: '$ctrl',
            templateUrl: 'modules/smartPayments/smartPayments.html',
            title: 'Smart Payments',
            params: {
                address: ''
            }
        });

};

export default SmartPaymentsConfig;
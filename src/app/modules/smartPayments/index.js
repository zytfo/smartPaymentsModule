import angular from 'angular';

// Create the module where our functionality can attach to
let smartPaymentsModule = angular.module('app.smartPayments', []);

// Include our UI-Router config settings
import SmartPaymentsConfig from './smartPayments.config';
smartPaymentsModule.config(SmartPaymentsConfig);

// Controllers
import SmartPaymentsCtrl from './smartPayments.controller';
smartPaymentsModule.controller('SmartPaymentsCtrl', SmartPaymentsCtrl);

export default smartPaymentsModule;
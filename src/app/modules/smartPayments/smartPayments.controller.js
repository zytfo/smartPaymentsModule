import helpers from '../../utils/helpers';
import Address from '../../utils/Address';
import CryptoHelpers from '../../utils/CryptoHelpers';
import Network from '../../utils/Network';

class SmartPaymentsCtrl {
    constructor($location, Wallet, Alert, Transactions, NetworkRequests, DataBridge, $state, $localStorage) {
            'ngInject';

            // Alert service
            this._Alert = Alert;
            // $location to redirect
            this._location = $location;
            // NetworkRequests service
            this._NetworkRequests = NetworkRequests;
            // Wallet service
            this._Wallet = Wallet;
            // Transactions service
            this._Transactions = Transactions;
            // DataBridge service
            this._DataBridge = DataBridge;
            // $state
            this._$state = $state;
            //Local storage
            this._storage = $localStorage;
            // use helpers in view
            this._helpers = helpers;

            this.dates = [];
            this.date = '';
            this.tab = 1;
            this.transactions = [];
            this.charsLeft = 1024;
            //new_date = "2017-06-01T08:30";
            //var time = new Time();

            // If no wallet show alert and redirect to home
            if (!this._Wallet.current) {
                this._Alert.noWalletLoaded();
                this._location.path('/');
                return;
            }

            /**
             * Default simple transfer properties
             */
            this.formData = {}
            this.formData.recipient = '';
            this.formData.amount = 0;
            this.formData.message = '';
            this.formData.encryptMessage = false;
            this.formData.fee = 0;

            // To store our password and decrypted/generated private key
            this.common = {
                "password": "",
                "privateKey": ""
            }

            // Multisig data, we won't use it but it is needed anyway
            this.formData.innerFee = 0;
            this.formData.isMultisig = false;
            this.formData.multisigAccount = '';

            // Mosaic data, we won't use it but it is needed anyway
            this.formData.mosaics = null;
            this.mosaicsMetaData = null;

            // To lock our send button if a transaction is not finished processing
            this.okPressed = false;
        }
        /**
         * updateFee() Update transaction fee
         */
    updateFee() {
        let entity = this._Transactions.prepareTransfer(this.common, this.formData, this.mosaicsMetaData);
        this.formData.fee = entity.fee;
    }

    // for getting polls list tabs
    isTabSet(tab) {
        return (this.tab === tab);
    }

    // for setting polls list tabs
    setTab(tab) {
        //this.inputAddressValid = true;
        //this.loadingAddressError = false;
        //this.createIndex = false;
        //this.showDetails = false;
        this.tab = tab;
    }

    // for setting (VOTE/MULTISIG/RESULTS tabs)
    setDetailsTab(tab) {
        this.createIndex = false;
        if (tab === 1) {
            this.showVote = true;
            this.multisigVote = false;
        } else if (tab === 2) {
            this.multisigAccount = this._DataBridge.accountData.meta.cosignatoryOf[0];
            this.showVote = true;
            this.multisigVote = true;
        } else if (tab === 3) {
            this.showVote = false;
            this.multisigVote = false;
        }
        this.checkHasVoted();
    }

    // for getting (VOTE/MULTISIG/RESULTS tabs)
    isDetailsTabSet(tab) {
        if (tab === 1) {
            return (this.showVote && !this.multisigVote);
        } else if (tab === 2) {
            return this.multisigVote;
        } else if (tab === 3) {
            return !this.showVote;
        }
    }

    saveDate() {
        var day = this.date.getDate();
        var month = this.date.getMonth() + 1;
        var year = this.date.getFullYear();
        var hour = this.date.getHours();
        var minute = this.date.getMinutes();

        if (day < 10) {
            day = '0' + day
        }

        if (month < 10) {
            month = '0' + month
        }
        this.date = month + '/' + day + '/' + year + ' ' + hour + ':' + minute;
    }

    createScheduledTransaction() {

    }

    saveTransaction() {
        this.okPressed = true;
        // Decrypt/generate private key and check it. Returned private key is contained into this.common
        if (!CryptoHelpers.passwordToPrivatekeyClear(this.common, this._Wallet.currentAccount, this._Wallet.algo, true)) {
            this._Alert.invalidPassword();
            // Enable send button
            this.okPressed = false;
            return;
        } else if (!CryptoHelpers.checkAddress(this.common.privateKey, this._Wallet.network, this._Wallet.currentAccount.address)) {
            this._Alert.invalidPassword();
            // Enable send button
            this.okPressed = false;
            return;
        }
        var transaction = { formData: this.formData, date: this.date };
        //this.dates.push(this.date);
        this.transactions.push(transaction);
    }

    addTransaction() {
        this.okPressed = false;
        this.formData = {}
        this.formData.recipient = '';
        this.formData.amount = 0;
        this.formData.message = '';
        this.formData.encryptMessage = false;
        this.formData.fee = 0;
        this.date = '';
    }

    /**
     * send() Build and broadcast the transaction to the network
     */
    send() {
        // Disable send button;
        this.okPressed = true;

        // Decrypt/generate private key and check it. Returned private key is contained into this.common
        if (!CryptoHelpers.passwordToPrivatekeyClear(this.common, this._Wallet.currentAccount, this._Wallet.algo, true)) {
            this._Alert.invalidPassword();
            // Enable send button
            this.okPressed = false;
            return;
        } else if (!CryptoHelpers.checkAddress(this.common.privateKey, this._Wallet.network, this._Wallet.currentAccount.address)) {
            this._Alert.invalidPassword();
            // Enable send button
            this.okPressed = false;
            return;
        }

        // Build the entity to serialize
        let entity = this._Transactions.prepareTransfer(this.common, this.formData, this.mosaicsMetaData);

        // Construct transaction byte array, sign and broadcast it to the network
        return this._Transactions.serializeAndAnnounceTransaction(entity, this.common).then((res) => {
                // Check status
                if (res.status === 200) {
                    // If code >= 2, it's an error
                    if (res.data.code >= 2) {
                        this._Alert.transactionError(res.data.message);
                    } else {
                        this._Alert.transactionSuccess();
                    }
                }
                // Enable send button
                this.okPressed = false;
                // Delete private key in common
                this.common.privateKey = '';
            },
            (err) => {
                // Delete private key in common
                this.common.privateKey = '';
                // Enable send button
                this.okPressed = false;
                this._Alert.transactionError('Failed ' + err.data.error + " " + err.data.message);
            });
    }

}

export default SmartPaymentsCtrl;
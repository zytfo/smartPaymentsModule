import helpers from '../../utils/helpers';
import Address from '../../utils/Address';
import CryptoHelpers from '../../utils/CryptoHelpers';
import Network from '../../utils/Network';
import KeyPair from '../../utils/KeyPair';
import Serialization from '../../utils/Serialization';
import Convert from '../../utils/Convert';

class SmartPaymentsCtrl {
    constructor($location, Wallet, Alert, Transactions, NetworkRequests, DataBridge, $state, $localStorage, $scope) {
        'ngInject';

        var _self = this;
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

        this.date = new Date();
        this.date = null;
        this.currentDate = new Date();
        this.maxDate = new Date(new Date().setFullYear(new Date().getFullYear() + 5));
        this.transactions = [];
        this.transactionsFromServer = [];
        this.publicKey = "";

        var socketUrl = 'ws://35.205.87.230:8081';
        this.socket = new WebSocket(socketUrl);

        // If no wallet show alert and redirect to home
        if (!this._Wallet.current) {
            this._Alert.noWalletLoaded();
            this._location.path('/');
            return;
        }

        /**
         * Default transfer transaction properties 
         */
        this.formData = {};
        // Alias or address user type in
        this.formData.rawRecipient = this._$state.params.address.length ? this._$state.params.address : '';
        if (this.formData.rawRecipient.length) {
            this.processRecipientInput();
        }
        // Cleaned recipient from @alias or input
        this.formData.recipient = '';
        this.formData.recipientPubKey = '';
        this.formData.message = '';
        this.rawAmount = 0;
        this.formData.amount = 0;
        this.formData.fee = 0;
        this.formData.encryptMessage = false;
        this.formData.hexMessage = false;
        // Multisig data
        this.formData.innerFee = 0;
        this.formData.isMultisig = false;
        this.formData.multisigAccount = this._DataBridge.accountData.meta.cosignatoryOf.length == 0 ? '' : this._DataBridge.accountData.meta.cosignatoryOf[0];
        // Mosaics data
        // Counter for mosaic gid
        this.counter = 1;
        this.formData.mosaics = null;
        this.mosaicsMetaData = this._DataBridge.mosaicDefinitionMetaDataPair;
        this.formData.isMosaicTransfer = false;
        this.currentAccountMosaicNames = [];
        this.selectedMosaic = "nem:xem";
        // Mosaics data for current account
        this.currentAccountMosaicData = "";

        // Check Transactions mode is on
        this.invoice = false;
        // Plain amount that'll be converted to micro XEM
        this.rawAmountInvoice = 0;

        // Alias address empty by default
        this.aliasAddress = '';
        // Not showing alias address input by default
        this.showAlias = false;
        // Needed to prevent user to click twice on send when already processing
        this.okPressed = false;
        this.getListPressed = false;

        // Character counter
        this.charsLeft = 1024;

        // Object to contain our password & private key data.
        this.common = {
            'password': '',
            'privateKey': '',
        };

        this.contacts = [];

        if (undefined !== this._storage.contacts && undefined !== this._storage.contacts[this._Wallet.currentAccount.address] && this._storage.contacts[this._Wallet.currentAccount.address].length) {
            this.contacts = this._storage.contacts[this._Wallet.currentAccount.address]
        }

        // Contacts to address book pagination properties
        this.currentPageAb = 0;
        this.pageSizeAb = 5;
        this.numberOfPagesAb = function() {
            return Math.ceil(this.contacts.length / this.pageSizeAb);
        }

        // Init account mosaics
        this.updateCurrentAccountMosaics();

        this.updateFees();

        this.socket.onmessage = function(event) {
            _self.transactionsFromServer = JSON.parse(event.data);
            for (var i = 0; i < _self.transactionsFromServer.length; i++) {
                _self.transactionsFromServer[i].date = new Date(_self.transactionsFromServer[i].date);
            }
        }
    }

    saveTransaction() {
        this.okPressed = true;
        this.getListPressed = false;
        if (this.date.getTime() < this.currentDate.getTime()) {
            this._Alert.incorrectDate();
            this.okPressed = false;
            return;
        }
        if (this.date.getTime() > this.maxDate.getTime()) {
            this._Alert.incorrectDate();
            this.okPressed = false;
            return;
        }
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
        this.updateFees();
        let entity = this._Transactions.prepareTransfer(this.common, this.formData, this.mosaicsMetaData);
        var transaction = { formData: this.formData, mosaicsMetaData: this.mosaicsMetaData, date: this.date };
        this.transactions.push(transaction);

        var secretPair = KeyPair.create(this.common.privateKey);

        var serialized = Serialization.serializeTransaction(entity);
        var signature = secretPair.sign(serialized);
        var broadcastable = JSON.stringify({
            "data": Convert.ua2hex(serialized),
            "signature": signature.toString()
        });

        var objectToSend = {}
        objectToSend.broadcastable = broadcastable;
        objectToSend.date = this.date;
        objectToSend.publicKey = secretPair.publicKey.toString();
        objectToSend.getListOfTransactions = false;
        objectToSend.toDelete = false;
        objectToSend.recipient = this.formData.recipient;
        objectToSend.message = this.formData.message;
        objectToSend.amount = this.formData.amount;
        this.socket.send(JSON.stringify(objectToSend));
        this._Alert.smartPaymentCreated();
        this.okPressed = false;
    }

    getListOfTransactions() {
        this.getListPressed = true;
        // Decrypt/generate private key and check it. Returned private key is contained into this.common
        if (!CryptoHelpers.passwordToPrivatekeyClear(this.common, this._Wallet.currentAccount, this._Wallet.algo, true)) {
            this._Alert.invalidPassword();
            // Enable send button
            this.getListPressed = false;
            return;
        } else if (!CryptoHelpers.checkAddress(this.common.privateKey, this._Wallet.network, this._Wallet.currentAccount.address)) {
            this._Alert.invalidPassword();
            // Enable send button
            this.getListPressed = false;
            return;
        }
        var object = {}
        var secretPair = KeyPair.create(this.common.privateKey);
        var publicKey = secretPair.publicKey.toString();
        object.getListOfTransactions = true;
        object.publicKey = publicKey;
        object.toDelete = false;
        this.socket.send(JSON.stringify(object));
    }

    deleteTransactionFromServer(index) {
        var objectToSend = {}
        objectToSend.toDelete = true;
        objectToSend.id = this.transactionsFromServer[index]._id;
        this.socket.send(JSON.stringify(objectToSend));
        this.transactionsFromServer.splice(index, 1);
    }


    /**
     * Set or unset data for mosaic transfer
     */
    setMosaicTransfer() {
        if (this.formData.isMosaicTransfer) {
            // Set the initial mosaic array
            this.formData.mosaics = [{
                'mosaicId': {
                    'namespaceId': 'nem',
                    'name': 'xem'
                },
                'quantity': 0,
                'gid': 'mos_id_0'
            }];
            // In case of mosaic transfer amount is used as multiplier,
            // set to 1 as default
            this.rawAmount = 1;
            this.formData.amount = 1;
        } else {
            // Reset mosaics array
            this.formData.mosaics = null;
            // Reset amount
            //this.rawAmount = 0;
            //this.formData.amount = 0;
        }
        this.updateFees();
    }

    /**
     * Process recipient input and get data from network
     * 
     * @note: I'm using debounce in view to get data typed with a bit of delay,
     * it limits network requests
     */
    processRecipientInput() {
        // Check if value is an alias
        let isAlias = (this.formData.rawRecipient.lastIndexOf("@", 0) === 0);
        // Reset recipient data
        this.resetRecipientData();

        // return if no value or address length < to min address length AND not an alias
        if (!this.formData.rawRecipient || this.formData.rawRecipient.length < 40 && !isAlias) {
            return;
        }

        // Get recipient data depending of address or alias used
        if (isAlias) {
            // Clean namespace name of the @
            let nsForLookup = this.formData.rawRecipient.substring(1);
            // Get namespace info and account data from network
            this.getRecipientDataFromAlias(nsForLookup)
        } else { // Normal address used
            // Clean address
            let recipientAddress = this.formData.rawRecipient.toUpperCase().replace(/-/g, '');
            // Check if address is from network
            if (Address.isFromNetwork(recipientAddress, this._Wallet.network)) {
                // Get recipient account data from network
                this.getRecipientData(recipientAddress);
            } else {
                // Error
                this._Alert.invalidAddressForNetwork(recipientAddress, this._Wallet.network);
                // Reset recipient data
                this.resetRecipientData();
                return;
            }
        }

    }

    /**
     * Update transaction fee
     */
    updateFees() {
        if (!helpers.isAmountValid(this.rawAmount)) {
            this._Alert.invalidAmount();
            return;
        } else {
            this.formData.amount = helpers.cleanAmount(this.rawAmount);
            //console.log(this.formData.amount)
        }
        let entity = this._Transactions.prepareTransfer(this.common, this.formData, this.mosaicsMetaData);
        if (this.formData.isMultisig) {
            this.formData.innerFee = entity.otherTrans.fee;
            // Update characters left
            this.charsLeft = entity.otherTrans.message.payload.length ? 1024 - (entity.otherTrans.message.payload.length / 2) : 1024;
        } else {
            this.formData.innerFee = 0;
            // Update characters left
            this.charsLeft = entity.message.payload.length ? 1024 - (entity.message.payload.length / 2) : 1024;
        }
        this.formData.fee = entity.fee;
    }

    /**
     * Get recipient account data from network
     * 
     * @param address: The recipient address
     */
    getRecipientData(address) {
        return this._NetworkRequests.getAccountData(helpers.getHostname(this._Wallet.node), address).then((data) => {
                // Store recipient public key (needed to encrypt messages)
                this.formData.recipientPubKey = data.account.publicKey;
                //console.log(this.formData.recipientPubKey)
                // Set the address to send to
                this.formData.recipient = address;
            },
            (err) => {
                this._Alert.getAccountDataError(err.data.message);
                // Reset recipient data
                this.resetRecipientData();
                return;
            });
    }

    /**
     * Get recipient account data from network using @alias
     * 
     * @param alias: The recipient alias (namespace)
     */
    getRecipientDataFromAlias(alias) {
        return this._NetworkRequests.getNamespacesById(helpers.getHostname(this._Wallet.node), alias).then((data) => {
                // Set the alias address
                this.aliasAddress = data.owner;
                // Show the read-only input containing alias address
                this.showAlias = true;
                // Check if address is from network
                if (Address.isFromNetwork(this.aliasAddress, this._Wallet.network)) {
                    // Get recipient account data from network
                    this.getRecipientData(this.aliasAddress);
                } else {
                    // Unexpected error, this alert will not dismiss on timeout
                    this._Alert.invalidAddressForNetwork(this.aliasAddress, this._Wallet.network);
                    // Reset recipient data
                    this.resetRecipientData();
                    return;
                }
            },
            (err) => {
                this._Alert.getNamespacesByIdError(err.data.message);
                // Reset recipient data
                this.resetRecipientData();
                return;
            });
    }

    /**
     * Get selected mosaic and push it in mosaics array
     */
    attachMosaic() {
        // increment counter 
        this.counter++;
        // Get current account
        let acct = this._Wallet.currentAccount.address;
        if (this.formData.isMultisig) {
            // Use selected multisig
            acct = this.formData.multisigAccount.address;
        }
        // Get the mosaic selected
        let mosaic = this._DataBridge.mosaicOwned[acct][this.selectedMosaic];
        // Check if mosaic already present in mosaics array
        let elem = $.grep(this.formData.mosaics, function(w) {
            return helpers.mosaicIdToName(mosaic.mosaicId) === helpers.mosaicIdToName(w.mosaicId);
        });
        // If not present, update the array
        if (elem.length === 0) {
            this.formData.mosaics.push({
                'mosaicId': mosaic['mosaicId'],
                'quantity': 0,
                'gid': 'mos_id_' + this.counter
            });

            this.updateFees();
        }
    }

    /**
     * Remove a mosaic from mosaics array
     * 
     * @param index: Index of mosaic object in the array 
     */
    removeMosaic(index) {
        this.formData.mosaics.splice(index, 1);
        this.updateFees();
    }

    /**
     * Get current account mosaics names
     */
    updateCurrentAccountMosaics() {
        //Fix this.formData.multisigAccount error on logout
        if (null === this.formData.multisigAccount) {
            return;
        }
        // Get current account
        let acct = this._Wallet.currentAccount.address;
        if (this.formData.isMultisig) {
            // Use selected multisig
            acct = this.formData.multisigAccount.address;
        }
        // Set current account mosaics names if mosaicOwned is not undefined
        if (undefined !== this._DataBridge.mosaicOwned[acct]) {
            this.currentAccountMosaicData = this._DataBridge.mosaicOwned[acct];
            this.currentAccountMosaicNames = Object.keys(this._DataBridge.mosaicOwned[acct]).sort();
        } else {
            this.currentAccountMosaicNames = ["nem:xem"];
            this.currentAccountMosaicData = "";
        }
        // Default selected is nem:xem
        this.selectedMosaic = "nem:xem";
    }

    /**
     * Reset data stored for recipient
     */
    resetRecipientData() {
        // Reset public key data
        this.formData.recipientPubKey = '';
        // Hide alias address input field
        this.showAlias = false;
        // Reset cleaned recipient address
        this.formData.recipient = '';
        // Encrypt message set to false
        this.formData.encryptMessage = false;
    }

    /**
     * Reset form data
     */
    resetData() {
        this.formData.rawRecipient = '';
        this.formData.message = '';
        this.date = '';
        this.rawAmount = 0;
        this.formData.amount = 0;
        this.common.privateKey = '';
        this.common.password = '';
    }

}

export default SmartPaymentsCtrl;
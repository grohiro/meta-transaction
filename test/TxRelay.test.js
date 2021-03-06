const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('Web3');
const provider = ganache.provider({
  "debug": true
});
const web3 = new Web3(provider);
const config = require('../config.json');

const MetaTransactionClient = require('../lib/metaTransactionClient');
const MetaTransactionServer = require('../lib/metaTransactionServer');

const compiledTxRelay = require('../build/TxRelay');
const compiledMessageBox = require('../build/MessageBox');

let accounts;
let txRelay;
let messageBox;
let txToServer;
let newMessage = 'Updated message for Message Box!!';

before( async () => {
  accounts = await web3.eth.getAccounts();

  txRelay = await new web3.eth.Contract(JSON.parse(compiledTxRelay.interface))
    .deploy({
      data: compiledTxRelay.bytecode,
      arguments: []
    })
    .send({
      from: accounts[0],
      gas: '2000000'
    });
  txRelay.setProvider(provider);

  messageBox = await new web3.eth.Contract(JSON.parse(compiledMessageBox.interface))
    .deploy({
      data: compiledMessageBox.bytecode,
      arguments: ["Hello from message box"]
    })
    .send({
      from: accounts[0],
      gas: '2000000'
    });
  messageBox.setProvider(provider);

});

describe('txrelay', () => {

  it('deploys contracts', () => {
    assert.ok(txRelay.options.address);
    assert.ok(messageBox.options.address);

    console.log("TxRelay address is " + txRelay.options.address);
    console.log("MessageBox address is " + messageBox.options.address);
  });

  it('can sign tranxsaction at client', async () => {

    await web3.eth.sendTransaction({
      to: config.server_account.address,
      from: accounts[1],
      value: web3.utils.toWei('1', "ether"),
      gas: '1000000'
    });

    // fetch nonce of sender address tracked at TxRelay
    let nonce = await txRelay.methods.nonce(config.client_account.address).call();

    let messageBoxAbi = JSON.parse(compiledMessageBox.interface);
    let rawTx = await MetaTransactionClient.createTx(messageBoxAbi, 'setMessage', [newMessage], {
      to: messageBox.options.address,
      value: 0,
      nonce: parseInt(nonce), // nonce must match the one at TxRelay contract
      gas: 2000000,
      gasPrice: 2000000,
      gasLimit: 2000000
    });
    txToServer = await MetaTransactionClient.createRawTxToRelay(
      rawTx,
      config.client_account.address,
      config.client_account.privateKey,
      txRelay.options.address
    );

    assert.equal(config.client_account.address, txToServer.from);
  });

  it('can sign tranxsaction at server', async () => {

    // fetch nonce of sender address
    let nonce = await web3.eth.getTransactionCount(config.server_account.address);

    let signedTxToRelay = await MetaTransactionServer.createRawTxToRelay(
      JSON.parse(compiledTxRelay.interface),
      txToServer.sig,
      txToServer.to,
      txToServer.from,
      txToServer.data,
      {
        "gas": 2000000,
        "gasPrice": 2000000,
        "gasLimit": 2000000,
        "value": 0,
        "to": txRelay.options.address,
        "nonce": parseInt(nonce), // nonce of address which signs tx ad server
        "from": config.server_account.address
      },
      config.server_account.privateKey
    );

    const result = await web3.eth.sendSignedTransaction('0x' + signedTxToRelay);

    // show Log event at TxRelay contract
    result.logs.forEach((value, index, ar) => {
      let log = value;
      console.log(web3.eth.abi.decodeLog([
        {
          type: 'address',
          name: 'from'
        },
        {
          type: 'string',
          name: 'message'
        }
      ], log.data, log.topics))
    });

    message = await messageBox.methods.message().call();
    assert.equal(newMessage, message);

    sender = await messageBox.methods.sender().call();
    assert.equal(txRelay.options.address, sender);
  });

  it('increases nonce and can send transaction again', async () => {

    // fetch nonce of sender address tracked at TxRelay
    let clientAddressNonce = await txRelay.methods.nonce(config.client_account.address).call();

    // fetch nonce of sender address
    let serverAddressNonce = await web3.eth.getTransactionCount(config.server_account.address);

    let updateMessage = 'Here it updates message again';
    let messageBoxAbi = JSON.parse(compiledMessageBox.interface);
    let rawTx = await MetaTransactionClient.createTx(messageBoxAbi, 'setMessage', [updateMessage], {
      to: messageBox.options.address,
      value: 0,
      nonce: parseInt(clientAddressNonce), // nonce must match the one at TxRelay contract
      gas: 2000000,
      gasPrice: 2000000,
      gasLimit: 2000000
    });
    txToServer = await MetaTransactionClient.createRawTxToRelay(
      rawTx,
      config.client_account.address,
      config.client_account.privateKey,
      txRelay.options.address
    );

    let signedTxToRelay = await MetaTransactionServer.createRawTxToRelay(
      JSON.parse(compiledTxRelay.interface),
      txToServer.sig,
      txToServer.to,
      txToServer.from,
      txToServer.data,
      {
        "gas": 2000000,
        "gasPrice": 2000000,
        "gasLimit": 2000000,
        "value": 0,
        "to": txRelay.options.address,
        "nonce": parseInt(serverAddressNonce), // nonce of address which signs tx ad server
        "from": config.server_account.address
      },
      config.server_account.privateKey
    );

    const result = await web3.eth.sendSignedTransaction('0x' + signedTxToRelay);

    message = await messageBox.methods.message().call();
    assert.equal(updateMessage, message);
  });

  it('does not accept transaction if sender and signer is different', async () => {

    // fetch nonce of sender address tracked at TxRelay
    let clientAddressNonce = await txRelay.methods.nonce(config.client_account.address).call();

    // fetch nonce of sender address
    let serverAddressNonce = await web3.eth.getTransactionCount(config.server_account.address);

    let updateMessage = 'If this message is written to blockchain, test failed';
    let messageBoxAbi = JSON.parse(compiledMessageBox.interface);
    let rawTx = await MetaTransactionClient.createTx(messageBoxAbi, 'setMessage', [updateMessage], {
      to: messageBox.options.address,
      value: 0,
      nonce: parseInt(clientAddressNonce), // nonce must match the one at TxRelay contract
      gas: 2000000,
      gasPrice: 2000000,
      gasLimit: 2000000
    });
    txToServer = await MetaTransactionClient.createRawTxToRelay(
      rawTx,
      config.client_account.address,
      config.client_account.privateKey,
      txRelay.options.address
    );

    let signedTxToRelay = await MetaTransactionServer.createRawTxToRelay(
      JSON.parse(compiledTxRelay.interface),
      txToServer.sig,
      txToServer.to,
      config.server_account.address, // Since this is different from signer, this transaction should fail
      txToServer.data,
      {
        "gas": 2000000,
        "gasPrice": 2000000,
        "gasLimit": 2000000,
        "value": 0,
        "to": txRelay.options.address,
        "nonce": parseInt(serverAddressNonce), // nonce of address which signs tx ad server
        "from": config.server_account.address
      },
      config.server_account.privateKey
    );

    try {
      const result = await web3.eth.sendSignedTransaction('0x' + signedTxToRelay);
      assert(false);
    }
    catch (err) {
      assert(true);
    }

    message = await messageBox.methods.message().call();
    assert.notEqual(updateMessage, message);
  });

});

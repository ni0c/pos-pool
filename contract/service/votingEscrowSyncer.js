/* eslint-disable node/no-unsupported-features/es-syntax */
/* eslint-disable node/no-unpublished-require */
/* eslint-disable prefer-const */
/* eslint-disable no-unused-vars */
/* eslint-disable prettier/prettier */
require('dotenv').config();
const debug = require('debug')('votingEscrowDataSyncer');
const { Conflux } = require("js-conflux-sdk");
const { loadPrivateKey } = require('../utils/index');
const coreBridgeInfo = require("../artifacts/contracts/eSpacePoolBridge.sol/CoreBridge.json");

const conflux = new Conflux({
  url: process.env.CFX_RPC_URL,
  networkId: parseInt(process.env.CFX_NETWORK_ID),
});

// NOTE: make sure sender account have enough balance to pay gasFee and storageFee
const account = conflux.wallet.addPrivateKey(loadPrivateKey());

const coreBridge = conflux.Contract({
  abi: coreBridgeInfo.abi,
  address: process.env.CORE_BRIDGE,
});

const sendTxMeta = {
  from: account.address
};

async function syncVoteStatus() {
  setInterval(async () => {
    try {
      let crossingVotes = await coreBridge.queryCrossingVotes();
      debug('crossStake: ', crossingVotes);
      if (crossingVotes > 0) {
        const receipt = await coreBridge
          .crossStake()
          .sendTransaction(sendTxMeta)
          .executed();
        debug(`crossStake finished: `, receipt.transactionHash, receipt.outcomeStatus);
      }
    } catch (e) {
      console.log('crossingVotes error: ', e);
    }
    
    try {
      let userSummary = await coreBridge.queryUserSummary();
      debug('withdrawVotes: ', userSummary.unlocked);
      let unlocked = Number(userSummary.unlocked);
      while(unlocked > 0) {
        const thisTime = unlocked >= 2 ? 2 : 1;
        const receipt = await coreBridge
          .withdrawVotesByVotes(thisTime)
          .sendTransaction(sendTxMeta)
          .executed();
        debug(`withdrawVotes finished: `, receipt.transactionHash, receipt.outcomeStatus);

        unlocked -= thisTime;
      }
    } catch(e) {
      console.log('withdrawVotes error: ', e);
    }

    try {
      let unstakeLen = await coreBridge.queryUnstakeLen();
      debug('handleUnstake: ', unstakeLen);
      let userSummary = await coreBridge.queryUserSummary();
      if (unstakeLen > 0 && userSummary.locked > 0) {
        for(let i = 0; i < unstakeLen; i++) {
          const receipt = await coreBridge
            .handleOneUnstake()
            .sendTransaction(sendTxMeta)
            .executed();
            debug(`handleUnstake finished: `, receipt.transactionHash, receipt.outcomeStatus);
        }
      }
    } catch (e) {
      console.log("unstake error: ", e);
    }
  }, 1000 * 60 * 5);
}

async function main() {
  console.log('==== eSpacePool VotingEscrow Crossing Tasks Started ====');
  try {
    syncVoteStatus();
  } catch (e) {
    console.log(e);
  }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
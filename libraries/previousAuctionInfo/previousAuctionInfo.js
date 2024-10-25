import {on as onEvent} from '../../src/events.js';
import { EVENTS } from '../../src/constants.js';
import {getGlobal} from '../../src/prebidGlobal.js';

let previousAuctionInfoEnabled = false;
let enabledBidders = [];

export function enablePreviousAuctionInfo(config) {
  // eslint-disable-next-line no-console
  console.log('enablePreviousAuctionInfo', { config });

  const { bidderCode, isBidRequestValid } = config;
  const enabledBidder = enabledBidders.find(bidder => bidder.bidderCode === bidderCode);
  if (!enabledBidder) enabledBidders.push({ bidderCode, isBidRequestValid });
  if (previousAuctionInfoEnabled) return;
  previousAuctionInfoEnabled = true;
  onEvent(EVENTS.AUCTION_END, onAuctionEndHandler);
  // onEvent(EVENTS.BID_WON, onBidWonHandler);
  onEvent(EVENTS.BID_REQUESTED, onBidRequestedHandler);
}

function onAuctionEndHandler(auctionDetails) {
  // eslint-disable-next-line no-console
  console.log('onAuctionEndHandler', { auctionDetails });

  // const winningBid = getGlobal().getAllWinningBids()?.find(winningBid => winningBid.auctionId === auctionDetails.auctionId);
  const highestCpmBid = auctionDetails.bidsReceived.reduce((highestBid, currentBid) => {
    return currentBid.cpm > highestBid.cpm ? currentBid : highestBid;
  }, auctionDetails.bidsReceived[0]);
  const receivedBidsMap = {};
  auctionDetails.bidsReceived.forEach(bidReceived => {
    receivedBidsMap[bidReceived.requestId] = bidReceived;
  });

  auctionDetails.bidderRequests.forEach(bidderRequest => {
    const enabledBidder = enabledBidders.find(bidder => bidder.bidderCode === bidderRequest.bidderCode);

    if (enabledBidder) {
      bidderRequest.bids.forEach(bid => {
        const previousAuctionInfoPayload = {
          bidderRequestId: bidderRequest.bidderRequestId,
          // auctionId: auctionDetails.auctionId,
          minBidToWin: highestCpmBid.cpm,
          // minBidToWin: winningBid?.cpm || 'nowinner',
          // rendered: winningBid?.status === BID_STATUS.RENDERED ? 1 : 0,
          rendered: 0,

          transactionId: bid.transactionId,

          source: 'pbjs',
          auctionId: auctionDetails.auctionId,
          impId: bid.bidId,
          // bidResponseId: auctionDetails.bidsReceived.find(bidReceived => bidReceived.requestId === bid.bidId).requestId,

          // targetedbidcpm: FLOAT, // the bid targeted as the 'winner' within PBS targeting. Not specified if includewinners flag not present
          highestcpm: highestCpmBid.cpm, // the highest bid seen by Prebid in the publisher's requested currency
          cur: bid.ortb2.cur,
          bidderCpm: receivedBidsMap[bid.bidId] ? receivedBidsMap[bid.bidId].cpm : 'nobid', // the price submitted by this bidder
          // biddererrorcode: INTEGER,  // if the bidder's bid was rejected, let them know the seatnonbid code
          timestamp: auctionDetails.timestamp, // the time of the auction
        }

        window.pbpai = window.pbpai || {};
        if (!window.pbpai[bidderRequest.bidderCode]) {
          window.pbpai[bidderRequest.bidderCode] = [];
        }
        window.pbpai[bidderRequest.bidderCode].push(previousAuctionInfoPayload);
      });
    }
  });
}

// function onBidWonHandler(bid) {
//   // eslint-disable-next-line no-console
//   console.log('onBidWonHandler', { bid });
//   // const winningBidData = {
//   //   bidderCode: bid.bidderCode,
//   //   cpm: bid.cpm,
//   //   status: bid.status,
//   //   transactionId: bid.transactionId,
//   // };

//   // // eslint-disable-next-line no-console
//   // console.log('onBidWonHandler', { tidMap, winningBidData });

//   // tidMap[winningBidData.transactionId].forEach(bidder => {
//   //   // eslint-disable-next-line no-console
//   //   console.log('test 1');

//   //   if (bidder.bidderCode !== winningBidData.bidderCode) {
//   //     // eslint-disable-next-line no-console
//   //     console.log('test 2');
//   //     // const previousAuctionInfoPayload = {
//   //     //   bidderRequestId: bidder.bidderRequestId,
//   //     //   auctionId: winningBidData.transactionId,
//   //     //   minBidToWin: winningBidData.cpm,
//   //     //   rendered: winningBidData.status === CONSTANTS.BID_STATUS.RENDERED ? 1 : 0,
//   //     // };

//   //     const previousAuctionInfoPayload = { // need to test locally and console.log all of the values in this object
//   //       bidderRequestId: bidder.bidderRequestId,
//   //       auctionId: winningBidData.transactionId,
//   //       minBidToWin: winningBidData.cpm,
//   //       rendered: winningBidData.status === BID_STATUS.RENDERED ? 1 : 0,
//   //       // highestcpm: auctionDetails.highestCpm,
//   //       // cur: auctionDetails.currency,
//   //       // biddererrorcode: winningBidData.errorCode || 0
//   //     };

//   //     window.pbpai = window.pbpai || {};
//   //     if (!window.pbpai[bidder.bidderCode]) {
//   //       window.pbpai[bidder.bidderCode] = [];
//   //     }
//   //     window.pbpai[bidder.bidderCode].push(previousAuctionInfoPayload);
//   //   }
//   // });
// }

function onBidRequestedHandler(bidRequest) {
  // eslint-disable-next-line no-console
  console.log('onBidRequestedHandler', { bidRequest });
  const enabledBidder = enabledBidders.find(bidder => bidder.bidderCode === bidRequest.bidderCode);

  // if (enabledBidder && enabledBidder.isBidRequestValid(bidRequest)) {
  if (enabledBidder) {
    // // eslint-disable-next-line no-console
    // console.log('bidder is enabled and bid request is valid', { bidRequest });
    // eslint-disable-next-line no-console
    console.log('bidder is enabled', { bidRequest });
    window.pbpai = window.pbpai || {};

    if (window.pbpai && window.pbpai[bidRequest.bidderCode]) {
      const winningBids = getGlobal().getAllWinningBids();
      const winningBidsMap = {};
      winningBids.forEach(winningBid => {
        winningBidsMap[winningBid.requestId] = winningBid;
      });

      // eslint-disable-next-line no-console
      console.log(window.pbpai[bidRequest.bidderCode]);
      // eslint-disable-next-line no-console
      console.log(winningBidsMap);
      // eslint-disable-next-line no-console
      console.log(window.pbpai[bidRequest.bidderCode].find(bid => bid.impId === winningBidsMap[bid.impId].requestId));
      const winningBid = window.pbpai[bidRequest.bidderCode].find(bid => bid.impId === winningBidsMap[bid.impId].requestId);
      if (winningBid) {
        // // eslint-disable-next-line no-console
        // console.log('winningBid', { winningBid });
        // // eslint-disable-next-line no-console
        // console.log('winningBid.cpm', { cpm: winningBidsMap[winningBid.impId].cpm });
        winningBid.minBidToWin = winningBidsMap[winningBid.impId].cpm;
        winningBid.rendered = winningBidsMap[winningBid.impId].status === 'rendered' ? 1 : 0;
      }

      bidRequest.ortb2 ??= {};
      bidRequest.ortb2.ext ??= {};
      bidRequest.ortb2.ext.prebid ??= {};
      bidRequest.ortb2.ext.prebid.previousauctioninfo = window.pbpai[bidRequest.bidderCode];
      // bidRequest.ortb2.ext.prebid.previousauctioninfo.minBidToWin = window.pbpai[bidRequest.bidderCode].find(bid => bid.impId === winningBidsMap[bid.impId].requestId).cpm || 'meh';
      delete window.pbpai[bidRequest.bidderCode];
    }
  }
}

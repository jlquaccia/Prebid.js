ATC-677 Requirements

1. This library module should be called "Previous Auction Info"
2. The previousAuctionInfo code should be a library within PBJS that SSP bid adapter's can import and utilize if they would like
3. By default, previousAuctionInfo will be sent out to respective bidders in subsequent auctions within a bidders outgoing bid request
  - for example, bidder A and bidder B are participating in auction 1. bidder A wins. during auction 2 (or next auction that bidder B is involved in), bidder B will receive the previousAuctionInfo within their bid request.
  - bidder A (the winner) should not receive previousAuctionInfo, only bids that lost the auction prior (and have pai enabled and submitted a valid bid should receive the info)
    - collect previousAuctionInfo on auctionEnd for enabled bidders who submit valid bids
    - collect winning bids on bidWon and store in an object by setting [transaction id]: { winning bid }
    - on bidRequested, if a bidder is enabled and they are on the window.pbpai object, see if a tid of one of the prior requests matches the tid of a winning bid.  if so then update the minBidToWin and rendered keys on the relative previousAuctionInfo object for the bidder
    - include the previousAuctionInfo onto bidRequest.ortb2.ext.prebid.previousauctioninfo
    - remove previousAuctionInfo from window.pbpai for the relative bidder
4. tid should be set (with the following priority): bid.ortb2Imp.ext.tid or auctionid or bidderRequestId
  - what about transactionId ???
5. Store all pending previousAuctionInfo data on the window object (not local storage)
6. Bids must be valid from bidders in order to be eligible to receive previousAuctionInfo during subsequent auctions (a bid adapter's isBidRequestValid function can be utilized here)
  - Don't want to incentivize bidder B (losing bidder) to submit invalid bids in order to gain access to previousAuctionInfo
7. Differences between PBJS and PBS proposed payloads:
  - Original PBJS proposed payload:
  {
    bidderRequestId: bidder.bidderRequestId,
    auctionId: winningBidData.transactionId,
    minBidToWin: winningBidData.cpm,
    rendered: winningBidData.status === CONSTANTS.BID_STATUS.RENDERED ? 1 : 0,
  }
  - Original PBS proposed payload (to be placed on the ORTB extension at ext.prebid.previousauctioninfo):
  {
    source: "pbjs",
    auctionId: STRING, // $.id of the previous auction
    impid: STRING,       // $.imp[].id of the previous auction
    bidresponseid: STRING, // seatbid[].bid[].id of the previous auction
    targetedbidcpm: FLOAT,          // the bid targeted as the 'winner' within PBS targeting. Not specified if includewinners flag not present
    highestcpm: FLOAT,        // the highest bid seen by Prebid in the publisher's requested currency
    cur: STRING,
    biddercpm: FLOAT,    // the price submitted by this bidder
    biddererrorcode: INTEGER,  // if the bidder's bid was rejected, let them know the seatnonbid code
    timestamp: INTEGER
  }
  - Verdict on what to pass from PBJS (a combo of PBJS and PBS):
  {
    bidderRequestId: 123,
    auctionId: imp.ext.tid, -- might be null
    minBidToWin, the bid needed to win this auction.
    rendered: 1/0, -- did prebid render a bid on this auction
    source: "pbjs",
    impid: STRING,
    bidresponseid: STRING,
    targetedbidcpm: FLOAT,
    highestcpm: FLOAT,
    cur: STRING,
    biddercpm: FLOAT,
    biddererrorcode: INTEGER,
    timestamp: INTEGER
  }

8. Example for how biddererrorcode logic should be sent:
  {
    "bidderA": [{
        auctionId: "1111",
        impid: "medrect",
        bidresponseid: "2222",
        highestcpm: 1.00,
        cur: "USD",
        biddererrorcode: -1        // no error
    },{
        auctionId: "1111"
        impid: "top-banner",
        bidresponseid: "3333"
        highestcpm: 1.25,
        cur: "USD",
        biddererrorcode: 301    // did not meet floor
    }],
    "bidderB" : [{
        ...
      }]
  }
  - NoBids (seatnonbid code 0) are not added to the data structure.
9. Configuration of the module would define which bidders to do this for and max queue length.
  - Make sure there's a configurable max size
  - We'll need an approach to removing older auction info that hasn't yet gotten reported.
10. Write tests for the new previousAuctionInfo library

Tests
Config
- the previous auction info module should only be initialized once
Auction End
- should only capture data for enabled bids who submitted a valid bid
Bid Request
- should update minBidToWin rendered fields if a pbjs bid won
- data should be set on bidRequest.ortb2.ext.prebid.previousauctioninfo
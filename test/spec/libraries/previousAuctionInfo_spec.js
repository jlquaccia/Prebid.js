import { previousAuctionInfoEnabled, enablePreviousAuctionInfo } from 'libraries/previousAuctionInfo/previousAuctionInfo.js';
import * as events from '../../../src/events.js';

describe('previous auction info', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.spy(events, 'on');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('config', () => {
    it('should only be initialized once', () => {
      // eslint-disable-next-line no-console
      console.log('previousAuctionInfoEnabled', previousAuctionInfoEnabled);
      const config = { bidderCode: 'testBidder', isBidRequestValid: () => true };

      enablePreviousAuctionInfo(config);
      expect(events.on.calledThrice).to.be.true;

      enablePreviousAuctionInfo(config);
      expect(events.on.callCount).to.equal(3);
    });
  });

  describe('on auction end', () => {
    it('should only capture data for enabled bids who submitted a valid bid', () => {});
  });

  describe('on bid requested', () => {
    it('should update the minBidToWin and rendered fields if a pbjs bid wins', () => {});
    it('should set data on bidRequest.ortb2.ext.prebid.previousauctioninfo', () => {});
  });
});

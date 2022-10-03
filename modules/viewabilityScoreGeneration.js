import {config} from '../src/config.js';
import adapterManager from '../src/adapterManager.js';
import * as events from '../src/events.js';
import CONSTANTS from '../src/constants.json';

const MODULE_NAME = 'viewabilityScoreGeneration';
const CONFIG_ENABLED = 'enabled';
const GPT_SLOT_RENDER_ENDED_EVENT = 'slotRenderEnded';
const GPT_IMPRESSION_VIEWABLE_EVENT = 'impressionViewable';
const GPT_SLOT_VISIBILITY_CHANGED_EVENT = 'slotVisibilityChanged';

export const getAndParseFromLocalStorage = key => JSON.parse(window.localStorage.getItem(key));
export const setAndStringifyToLocalStorage = (key, object) => { window.localStorage.setItem(key, JSON.stringify(object)); };

let vsgObj = getAndParseFromLocalStorage('viewability-data');

export const makeBidRequestsHook = (fn, bidderRequests) => {
  if (vsgObj) {
    bidderRequests.forEach(bidderRequest => {
      bidderRequest.bids.forEach(bid => {
        if (vsgObj[bid.adUnitCode]) bid.bidViewability = vsgObj[bid.adUnitCode];
      });
    });
  }

  fn(bidderRequests);
}

export const gptSlotRenderEndedHandler = (adSlotElementId, setToLocalStorageCb) => {
  if (vsgObj) {
    if (vsgObj[adSlotElementId]) {
      if (vsgObj[adSlotElementId].lastViewed) delete vsgObj[adSlotElementId].lastViewed;

      vsgObj[adSlotElementId].rendered = vsgObj[adSlotElementId].rendered + 1;
      vsgObj[adSlotElementId].updatedAt = Date.now().toString();
    } else {
      vsgObj[adSlotElementId] = {
        rendered: 1,
        viewed: 0,
        createdAt: Date.now().toString()
      }
    }
  } else {
    vsgObj = {
      [adSlotElementId]: {
        rendered: 1,
        viewed: 0,
        createdAt: Date.now().toString()
      }
    }
  }

  setToLocalStorageCb('viewability-data', vsgObj);
};

export const gptImpressionViewableHandler = (adSlotElementId, setToLocalStorageCb) => {
  if (vsgObj) {
    if (vsgObj[adSlotElementId]) {
      vsgObj[adSlotElementId].viewed = vsgObj[adSlotElementId].viewed + 1;
      vsgObj[adSlotElementId].updatedAt = Date.now().toString();
    } else {
      vsgObj[adSlotElementId] = {
        rendered: 0,
        viewed: 1,
        createdAt: Date.now().toString()
      }
    }
  } else {
    vsgObj = {
      [adSlotElementId]: {
        rendered: 0,
        viewed: 1,
        createdAt: Date.now().toString()
      }
    }
  }

  setToLocalStorageCb('viewability-data', vsgObj);
};

export const gptSlotVisibilityChangedHandler = (adSlotElementId, inViewPercentage, setToLocalStorageCb) => {
  if (inViewPercentage > 50) {
    const lastStarted = vsgObj[adSlotElementId].lastViewed;
    const currentTime = performance.now();

    if (lastStarted) {
      const diff = currentTime - lastStarted;
      vsgObj[adSlotElementId].totalViewTime = (vsgObj[adSlotElementId].totalViewTime || 0) + diff;
    }

    vsgObj[adSlotElementId].lastViewed = currentTime;
    setToLocalStorageCb('viewability-data', vsgObj);
  }
}

export let init = () => {
  events.on(CONSTANTS.EVENTS.AUCTION_INIT, () => {
    // read the config for the module
    const globalModuleConfig = config.getConfig(MODULE_NAME) || {};
    // do nothing if module-config.enabled is not set to true
    // this way we are adding a way for bidders to know (using pbjs.getConfig('bidViewability').enabled === true) whether this module is added in build and is enabled
    if (globalModuleConfig[CONFIG_ENABLED] !== true) {
      return;
    }

    // add the GPT event listeners
    window.googletag = window.googletag || {};
    window.googletag.cmd = window.googletag.cmd || [];
    window.googletag.cmd.push(() => {
      window.googletag.pubads().addEventListener(GPT_SLOT_RENDER_ENDED_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        gptSlotRenderEndedHandler(currentAdSlotElement, setAndStringifyToLocalStorage);
      });

      window.googletag.pubads().addEventListener(GPT_IMPRESSION_VIEWABLE_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        gptImpressionViewableHandler(currentAdSlotElement, setAndStringifyToLocalStorage);
      });

      window.googletag.pubads().addEventListener(GPT_SLOT_VISIBILITY_CHANGED_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        gptSlotVisibilityChangedHandler(currentAdSlotElement, event.inViewPercentage, setAndStringifyToLocalStorage);
      });
    });
  });

  adapterManager.makeBidRequests.after(makeBidRequestsHook);
}

init();

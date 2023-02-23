import {config} from '../src/config.js';
import adapterManager from '../src/adapterManager.js';
import { targeting } from '../src/targeting.js';
import * as events from '../src/events.js';
import CONSTANTS from '../src/constants.json';
import { isAdUnitCodeMatchingSlot } from '../src/utils.js';

const MODULE_NAME = 'viewabilityScoreGeneration';
const ENABLED = 'enabled';
const TARGETING = 'targeting';
const GPT_SLOT_RENDER_ENDED_EVENT = 'slotRenderEnded';
const GPT_IMPRESSION_VIEWABLE_EVENT = 'impressionViewable';
const GPT_SLOT_VISIBILITY_CHANGED_EVENT = 'slotVisibilityChanged';
// const TOTAL_VIEW_TIME_LIMIT = 1000000000000;

export const getAndParseFromLocalStorage = key => JSON.parse(window.localStorage.getItem(key));
export const setAndStringifyToLocalStorage = (key, object) => { window.localStorage.setItem(key, JSON.stringify(object)); };

let vsgObj = getAndParseFromLocalStorage('viewability-data');

export const makeBidRequestsHook = (fn, bidderRequests) => {
  if (vsgObj) {
    bidderRequests.forEach(bidderRequest => {
      bidderRequest.bids.forEach(bid => {
        const bidViewabilityFields = { ...vsgObj[bid.adUnitCode] };
        // Deleteing this field as it is only required to calculate totalViewtime and no need to send it to translator.
        delete bidViewabilityFields.lastViewStarted;
        // Deleteing totalTimeView incase value is less than 1 sec.
        if (bidViewabilityFields.totalViewTime == 0) {
          delete bidViewabilityFields.totalViewTime;
        }
        if (vsgObj[bid.adUnitCode]) bid.bidViewability = bidViewabilityFields;
      });
    });
  }

  fn(bidderRequests);
}

const incrementRenderCount = key => {
  if (vsgObj) {
    if (vsgObj[key]) {
      vsgObj[key].rendered = vsgObj[key].rendered + 1;
      vsgObj[key].updatedAt = Date.now();
    } else {
      vsgObj[key] = {
        rendered: 1,
        viewed: 0,
        createdAt: Date.now()
      }
    }
  } else {
    vsgObj = {
      [key]: {
        rendered: 1,
        viewed: 0,
        createdAt: Date.now()
      }
    }
  }
};

const incrementViewCount = key => {
  if (vsgObj) {
    if (vsgObj[key]) {
      vsgObj[key].viewed = vsgObj[key].viewed + 1;
      vsgObj[key].updatedAt = Date.now();
    } else {
      vsgObj[key] = {
        rendered: 0,
        viewed: 1,
        createdAt: Date.now()
      }
    }
  } else {
    vsgObj = {
      [key]: {
        rendered: 0,
        viewed: 1,
        createdAt: Date.now()
      }
    }
  }
};

const incrementTotalViewTime = (key, inViewPercentage, setToLocalStorageCb) => {
  const currentTime = Date.now();
  const lastViewStarted = vsgObj[key].lastViewStarted;
  let diff;
  if (inViewPercentage < 50) {
    if (lastViewStarted) {
      diff = currentTime - lastViewStarted;
      vsgObj[key].totalViewTime = Math.round((vsgObj[key].totalViewTime || 0) + diff / 1000);
      delete vsgObj[key].lastViewStarted;
    }
  } else {
    if (lastViewStarted) {
      diff = currentTime - lastViewStarted;
      vsgObj[key].totalViewTime = Math.round((vsgObj[key].totalViewTime || 0) + diff / 1000);
    }
    vsgObj[key].lastViewStarted = currentTime;
    setToLocalStorageCb('viewability-data', vsgObj);
  }
};

export const gptSlotRenderEndedHandler = (adSlotElementId, adSlotSize, setToLocalStorageCb) => {
  // eslint-disable-next-line no-console
  console.log({ adSlotElementId, adSlotSize, setToLocalStorageCb });
  incrementRenderCount(adSlotElementId);
  incrementRenderCount(adSlotSize);
  setToLocalStorageCb('viewability-data', vsgObj);
};

export const gptImpressionViewableHandler = (adSlotElementId, adSlotSizes, setToLocalStorageCb) => {
  incrementViewCount(adSlotElementId);

  if (adSlotSizes) {
    adSlotSizes.forEach(adSlotSize => {
      const adSlotKey = [adSlotSize.width, adSlotSize.height];
      incrementViewCount(adSlotKey);
    });
  }
  setToLocalStorageCb('viewability-data', vsgObj);
};

export const gptSlotVisibilityChangedHandler = (adSlotElementId, adSlotSizes, inViewPercentage, setToLocalStorageCb) => {
  incrementTotalViewTime(adSlotElementId, inViewPercentage, setToLocalStorageCb);

  if (adSlotSizes) {
    adSlotSizes.forEach(adSlotSize => {
      const adSlotKey = [adSlotSize.width, adSlotSize.height];
      incrementTotalViewTime(adSlotKey, inViewPercentage, setToLocalStorageCb);
    });
  }
};

export const calculateBucket = (bucketCategories, score) => {
  let bucketCategoriesObject = {};
  let result;

  bucketCategories.forEach((category, index) => {
    bucketCategoriesObject[category] = Math.round(((index + 1) / bucketCategories.length) * 10) / 10;
  });

  for (let i = 0; i < bucketCategories.length; i++) {
    if (score <= bucketCategoriesObject[bucketCategories[i]]) {
      result = bucketCategories[i];
      break;
    }
  }

  return result;
};

export const addViewabilityTargeting = (globalConfig, targetingSet, vsgLocalStorageObj, cb) => {
  Object.keys(targetingSet).forEach(targetKey => {
    if (Object.keys(targetingSet[targetKey]).length !== 0) {
      // Will add only required targetting keys by this module.
      targetingSet[targetKey] = {};
      if (
        vsgLocalStorageObj[targetKey] &&
        vsgLocalStorageObj[targetKey].hasOwnProperty('viewed') &&
        vsgLocalStorageObj[targetKey].hasOwnProperty('rendered')
      ) {
        const viewabilityScore = Math.round((vsgLocalStorageObj[targetKey].viewed / vsgLocalStorageObj[targetKey].rendered) * 10) / 10;
        const viewabilityBucket = calculateBucket(globalConfig[MODULE_NAME][TARGETING].bucketCategories, viewabilityScore);

        if (globalConfig[MODULE_NAME][TARGETING].score) {
          const targetingScoreKey = globalConfig[MODULE_NAME][TARGETING].scoreKey ? globalConfig[MODULE_NAME][TARGETING].scoreKey : 'bidViewabilityScore';
          targetingSet[targetKey][targetingScoreKey] = viewabilityScore;
        }

        if (globalConfig[MODULE_NAME][TARGETING].bucket) {
          const targetingBucketKey = globalConfig[MODULE_NAME][TARGETING].bucketKey ? globalConfig[MODULE_NAME][TARGETING].bucketKey : 'bidViewabilityBucket';
          targetingSet[targetKey][targetingBucketKey] = viewabilityBucket;
        }
      }
    }
  });
  cb(targetingSet);
};

export const setViewabilityTargetingKeys = globalConfig => {
  events.on(CONSTANTS.EVENTS.AUCTION_END, () => {
    if (vsgObj) {
      const targetingSet = targeting.getAllTargeting();
      addViewabilityTargeting(globalConfig, targetingSet, vsgObj, updateGptWithViewabilityTargeting);
    }
  });
};

export const updateGptWithViewabilityTargeting = targetingSet => {
  window.googletag.pubads().getSlots().forEach(slot => {
    Object.keys(targetingSet).filter(isAdUnitCodeMatchingSlot(slot)).forEach(targetId => {
      slot.updateTargetingFromMap(targetingSet[targetId])
    })
  });
}

export const setGptEventHandlers = () => {
  events.on(CONSTANTS.EVENTS.AUCTION_INIT, () => {
    // add the GPT event listeners
    window.googletag = window.googletag || {};
    window.googletag.cmd = window.googletag.cmd || [];
    window.googletag.cmd.push(() => {
      window.googletag.pubads().addEventListener(GPT_SLOT_RENDER_ENDED_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        const currentAdSlotSize = event.size;
        gptSlotRenderEndedHandler(currentAdSlotElement, currentAdSlotSize, setAndStringifyToLocalStorage);
      });

      window.googletag.pubads().addEventListener(GPT_IMPRESSION_VIEWABLE_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        const currentAdSlotSizes = event.slot.getSizes();
        gptImpressionViewableHandler(currentAdSlotElement, currentAdSlotSizes, setAndStringifyToLocalStorage);
      });

      window.googletag.pubads().addEventListener(GPT_SLOT_VISIBILITY_CHANGED_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        const currentAdSlotSizes = event.slot.getSizes();
        gptSlotVisibilityChangedHandler(currentAdSlotElement, currentAdSlotSizes, event.inViewPercentage, setAndStringifyToLocalStorage);
      });
    });
  });
};

const initConfigDefaults = config => {
  if (!config[MODULE_NAME][TARGETING]) { config[MODULE_NAME][TARGETING] = {} };

  config[MODULE_NAME][TARGETING].enabled =
    typeof config.viewabilityScoreGeneration?.targeting?.enabled === 'boolean'
      ? config.viewabilityScoreGeneration?.targeting?.enabled
      : false;

  config[MODULE_NAME][TARGETING].bucketCategories =
    config.viewabilityScoreGeneration?.targeting?.bucketCategories && config.viewabilityScoreGeneration?.targeting?.bucketCategories.every(i => typeof i === 'string')
      ? config.viewabilityScoreGeneration?.targeting?.bucketCategories
      : ['LOW', 'MEDIUM', 'HIGH'];

  config[MODULE_NAME][TARGETING].score =
    typeof config.viewabilityScoreGeneration?.targeting?.score === 'boolean'
      ? config.viewabilityScoreGeneration?.targeting?.score
      : true;

  config[MODULE_NAME][TARGETING].bucket =
    typeof config.viewabilityScoreGeneration?.targeting?.bucket === 'boolean'
      ? config.viewabilityScoreGeneration?.targeting?.bucket
      : true;
};

export let init = (setGptCb, setTargetingCb) => {
  config.getConfig(MODULE_NAME, (globalConfig) => {
    if (globalConfig[MODULE_NAME][ENABLED] !== true) {
      return;
    }

    initConfigDefaults(globalConfig);
    setGptCb();

    if (
      globalConfig.viewabilityScoreGeneration?.targeting?.enabled &&
      (globalConfig.viewabilityScoreGeneration?.targeting?.score || globalConfig.viewabilityScoreGeneration?.targeting?.bucket)
    ) {
      setTargetingCb(globalConfig);
    }

    adapterManager.makeBidRequests.after(makeBidRequestsHook);
  });
}

init(setGptEventHandlers, setViewabilityTargetingKeys);

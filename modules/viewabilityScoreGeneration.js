import {config} from '../src/config.js';
import adapterManager from '../src/adapterManager.js';
import * as events from '../src/events.js';
import CONSTANTS from '../src/constants.json';

const MODULE_NAME = 'viewabilityScoreGeneration';
const CONFIG_ENABLED = 'enabled';
const GPT_SLOT_RENDER_ENDED_EVENT = 'slotRenderEnded';
const GPT_IMPRESSION_VIEWABLE_EVENT = 'impressionViewable';

export function makeBidRequestsHook(fn, bidderRequests) {
  let vsgObj;
  if (localStorage.getItem('vsg')) {
    vsgObj = JSON.parse(localStorage.getItem('vsg'));
    bidderRequests.forEach(bidderRequest => {
      bidderRequest.bids.forEach(bid => {
        if (vsgObj[bid.adUnitCode]) bid.bidViewability = vsgObj[bid.adUnitCode];
      });
    });
  }

  // eslint-disable-next-line no-console
  console.log(bidderRequests);

  fn(bidderRequests);
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

    let vsgObj = JSON.parse(localStorage.getItem('vsg'));
    // add the GPT event listeners
    window.googletag = window.googletag || {};
    window.googletag.cmd = window.googletag.cmd || [];
    window.googletag.cmd.push(() => {
      window.googletag.pubads().addEventListener(GPT_SLOT_RENDER_ENDED_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        if (vsgObj) {
          if (vsgObj[currentAdSlotElement]) {
            if (vsgObj[currentAdSlotElement].lastViewed) delete vsgObj[currentAdSlotElement].lastViewed;
            // if (vsgObj[currentAdSlotElement].totalViewTime) delete vsgObj[currentAdSlotElement].totalViewTime;

            vsgObj[currentAdSlotElement].rendered = vsgObj[currentAdSlotElement].rendered + 1;
            vsgObj[currentAdSlotElement].updatedAt = new Date();
          } else {
            vsgObj[currentAdSlotElement] = {
              rendered: 1,
              viewed: 0,
              createdAt: new Date()
            }
          }
        } else {
          vsgObj = {
            [currentAdSlotElement]: {
              rendered: 1,
              viewed: 0,
              createdAt: new Date()
            }
          }
        }

        localStorage.setItem('vsg', JSON.stringify(vsgObj));
      });

      window.googletag.pubads().addEventListener(GPT_IMPRESSION_VIEWABLE_EVENT, function(event) {
        const currentAdSlotElement = event.slot.getSlotElementId();
        if (vsgObj) {
          if (vsgObj[currentAdSlotElement]) {
            vsgObj[currentAdSlotElement].viewed = vsgObj[currentAdSlotElement].viewed + 1;
            vsgObj[currentAdSlotElement].updatedAt = new Date();
          } else {
            vsgObj[currentAdSlotElement] = {
              rendered: 0,
              viewed: 1,
              createdAt: new Date(),
            }
          }
        } else {
          vsgObj = {
            [currentAdSlotElement]: {
              rendered: 0,
              viewed: 1,
              createdAt: new Date()
            }
          }
        }

        localStorage.setItem('vsg', JSON.stringify(vsgObj));
      });

      window.googletag.pubads().addEventListener('slotVisibilityChanged', function(event) {
        if (event.inViewPercentage > 1) {
          const currentAdSlotElement = event.slot.getSlotElementId();
          // eslint-disable-next-line no-console
          console.log(`${currentAdSlotElement} was in view`);
          // eslint-disable-next-line no-console
          console.log('event.inViewPercentage: ', event.inViewPercentage);

          const lastStarted = vsgObj[currentAdSlotElement].lastViewed;
          const currentTime = performance.now();

          if (lastStarted) {
            const diff = currentTime - lastStarted;
            vsgObj[currentAdSlotElement].totalViewTime = (vsgObj[currentAdSlotElement].totalViewTime || 0) + diff;
          }

          vsgObj[currentAdSlotElement].lastViewed = currentTime;
          localStorage.setItem('vsg', JSON.stringify(vsgObj));
        }
      });
    });
  });
  adapterManager.makeBidRequests.after(makeBidRequestsHook);
}

init();

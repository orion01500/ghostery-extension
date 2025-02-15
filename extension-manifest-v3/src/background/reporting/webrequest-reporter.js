/**
 * Ghostery Browser Extension
 * https://www.ghostery.com/
 *
 * Copyright 2017-present Ghostery GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0
 */

import {
  WebRequestPipeline,
  RequestReporter,
} from '@whotracksme/webextension-packages/packages/reporting';
import { getBrowserInfo } from '@ghostery/libs';

import { observe } from '/store/options.js';

import Request from '../utils/request.js';
import { updateTabStats } from '../stats.js';

import config from './config.js';
import communication from './communication.js';
import urlReporter from './url-reporter.js';

let webRequestReporter = null;

if (__PLATFORM__ !== 'safari') {
  const webRequestPipeline = new WebRequestPipeline();

  // Important to call it in a first tick as it assigns chrome. listeners
  webRequestPipeline.init();

  let pausedDomains = [];
  let isAntiTrackingEnabled = false;

  observe('blockTrackers', (blockTrackers) => {
    isAntiTrackingEnabled = blockTrackers;
  });

  observe('paused', (paused) => {
    pausedDomains = paused || [];
  });

  webRequestReporter = new RequestReporter(config.request, {
    webRequestPipeline,
    communication,
    countryProvider: urlReporter.countryProvider,
    trustedClock: communication.trustedClock,
    getBrowserInfo,
    isRequestAllowed: (state) => {
      if (!isAntiTrackingEnabled) {
        return true;
      }
      if (
        pausedDomains.some(
          ({ id }) => id === state.tabUrlParts.domainInfo.domain,
        )
      ) {
        return true;
      }
      return false;
    },
    onTrackerInteraction: (event, state) => {
      if (event === 'observed') {
        return;
      }

      const request = Request.fromRequestDetails({
        url: state.url,
        originUrl: state.tabUrl,
      });
      request.modified = true;

      updateTabStats(state.tabId, [request]);
    },
  });

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.action === 'mousedown') {
      webRequestReporter.recordClick(msg.event, msg.context, msg.href, sender);
    }
  });
}

export default webRequestReporter;

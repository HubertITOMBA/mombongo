import { test as base, expect } from "@playwright/test";
import { resetE2eAuthRateLimits } from "./reset-auth-rate-limits";

export { expect };

export const test = base.extend<{ _resetE2eAuthRateLimits: void }>({
  _resetE2eAuthRateLimits: [async ({}, use) => {
    await resetE2eAuthRateLimits();
    await use();
  }, { auto: true }],
});

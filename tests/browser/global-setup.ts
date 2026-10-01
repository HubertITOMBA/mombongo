import { resetE2eAuthRateLimits } from "./reset-auth-rate-limits";

export default async function globalSetup() {
  await resetE2eAuthRateLimits({ disconnect: true });
}

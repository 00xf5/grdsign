// Fetch utilities
export { fetchWithTimeout, fetchWithTimeoutRetry } from "./fetchWithTimeout";

// Token refresher
export { TokenRefresherImpl, AuthGrantError } from "./refresher";
export type { TokenRefresher } from "./refresher";

// Google
export { GoogleOAuthClient } from "./google/oauth";
export type { GoogleOAuthConfig, BuildGoogleAuthUrlInput, GoogleTokenResponse } from "./google/oauth";
export { GmailClient } from "./google/client";
export type { GmailMessage, GmailListResult, GmailMessageListItem, GmailPayload } from "./google/client";
export { buildRawMime, replySubject } from "./google/mime";
export type { OutgoingMail } from "./google/mime";
export {
  extractMessageBody,
  headerMap,
  parseFrom,
  formatMailDate,
  decodeGmailBodyData,
} from "./google/parse";
export type { ExtractedBody } from "./google/parse";

// Microsoft
export { MicrosoftOAuthClient } from "./microsoft/oauth";
export type { MicrosoftOAuthConfig, BuildMicrosoftAuthUrlInput, MicrosoftTokenResponse } from "./microsoft/oauth";
export { OutlookClient } from "./microsoft/client";
export type { OutlookListItem } from "./microsoft/client";

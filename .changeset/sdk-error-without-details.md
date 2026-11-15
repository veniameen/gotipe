---
"@gotipe/sdk": minor
---

`GoTipeApiError` no longer has `details`, and the `ApiError` type no longer declares it. GoTipe
Cloud never sent the field: its error object is `{ "code", "message" }` inside the `error`
envelope, so `details` was always `undefined`. Read `code`, `message` and `status`; remove any
code that reads `error.details` of a `GoTipeApiError`.

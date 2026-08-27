# Webhook delivery guarantees

When a trigger has an idempotency key, hackathon.new checks for a successful delivery
to the same webhook and event before sending again. A recorded success skips the
next POST. Receivers also get the key in `X-Webhook-Idempotency-Key` and should
use it to return the same result for repeated requests.

Delivery remains at least once in two narrow cases:

- A receiver can accept the POST before hackathon.new fails to record the success. A
  retry sends the POST again because there is no successful checkpoint to find.
- Two workers can check at the same time before either one records its success.
  Both can send the POST.

Closing both races requires a claimed or unique delivery record. This change
does not add that database constraint, so receivers must still deduplicate by
the idempotency header.

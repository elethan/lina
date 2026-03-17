Rules:

A completed WO or PM creates a new handover_requests row with state pending.
If handover must be retried, create a new row instead of changing approved or rejected back to pending.
If a request becomes obsolete, mark it cancelled.
Only the assigned scientist should be allowed to approve or reject.
Approval actions must be idempotent. A second click on the same card must not reapply the action.
Suggested Workflow

Work Order handover:

Engineer completes WO in Lina.
Lina inserts handover_requests with entityType = work_order, entityId = wo_id, state = pending.
Lina sends Teams Adaptive Card to the assigned scientist.
Scientist clicks Approve or Reject in Teams.
Lina validates the payload and updates the row.
Lina shows latest handover state in the WO UI.
PM handover:

Engineer completes PM in Lina.
Lina inserts handover_requests with entityType = pm, entityId = pm_instance_id, state = pending.
Lina sends Teams Adaptive Card to the assigned scientist.
Scientist clicks Approve or Reject.
Lina updates the row and shows the result in PM UI.
Adaptive Card Contents

Recommended card fields:

Equipment serial number
Site
System
Type: Work Order or PM
Lina record id
Engineer name
Completion timestamp
Short summary
Optional findings summary
Approve action
Reject action
Optional comment input
Card payload should include:

handoverRequestId
entityType
entityId
action
responseNonce

Minimum Setup Needed

Entra app registration
Needed for Teams and Microsoft identity integration.
Store:
tenant id
client id
client secret or certificate
Teams bot
Needed for interactive Adaptive Card submissions.
This is the core requirement if the scientist will click Approve or Reject inside Teams.

Teams app manifest
Package the bot as a Teams app and install it for the target users or team.

Public HTTPS callback endpoint
Lina needs an endpoint Teams can call when a card action is submitted.
Example future endpoint:

POST /api/teams/handover/action
User mapping
You need a reliable mapping from Lina users to Teams/Entra users.
At minimum use:
user.id
email
If needed later add:
entraObjectId
teamsUserId
Secret storage
Add env vars for:
Microsoft tenant id
client id
client secret
bot app id
bot app password or secret
public base URL
Optional Microsoft Graph
Graph is not the core of the response flow, but may be needed for:
user lookup
app installation
proactive messaging support
conversation bootstrap

Recommended Backend Endpoints

Future Lina endpoints:

POST /api/teams/handover/send
Creates and sends a new handover request card.

POST /api/teams/handover/action
Receives Approve or Reject from Teams.

GET /api/teams/handover/:id
Returns handover status for UI use if needed.

Validation Rules

When a Teams action is received:

Verify the Teams request is authentic.
Verify handover request exists.
Verify state is still pending.
Verify responder matches targetScientistUserId or allowed scientist identity.
Verify responseNonce matches and has not already been used.
Apply change once only.
Store comment and response timestamp.
Lina UI Behavior

For Work Orders:

Show handover badge based on latest handover_requests row.
Values:
pending, approved, rejected, none
For PM:

Same pattern as Work Orders.
Handover remains separate from completion.
Do not block engineer completion itself.
Completion and handover approval are two distinct events.
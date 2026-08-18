import type { WorkerModel } from "./worker-runner";

export const fakeInboundSalesEmailAction = {
  id: "call_send_email",
  capabilityId: "gmail.send_email",
  input: { to: ["maya@northstar.example"], subject: "Re: Enterprise pricing enquiry", body: "Thanks for your enquiry. We would be glad to speak this week." },
  summary: "Send the prepared email response",
} as const;

export class FakeInboundSalesModel implements WorkerModel {
  async plan(): Promise<Awaited<ReturnType<WorkerModel["plan"]>>> {
    return {
      toolCalls: [
        { id: "call_search_email", capabilityId: "gmail.search_messages", input: { query: "new sales enquiry", maxResults: 10 }, summary: "Search Gmail for new enquiries" },
        { id: "call_read_email", capabilityId: "gmail.read_message", input: { messageId: "msg_lead_001" }, summary: "Read the sales enquiry" },
        { id: "call_search_contact", capabilityId: "hubspot.search_contacts", input: { email: "maya@northstar.example" }, summary: "Search HubSpot for the sender" },
        { id: "call_upsert_contact", capabilityId: "hubspot.upsert_contact", input: { email: "maya@northstar.example", firstName: "Maya", lifecycleStage: "salesqualifiedlead" }, summary: "Update the HubSpot contact" },
        fakeInboundSalesEmailAction,
        { id: "call_slack", capabilityId: "slack.post_message", input: { channelId: "C_SALES", text: "Qualified enterprise lead: Maya at Northstar, 80 seats." }, summary: "Post the qualified lead summary to Slack" },
      ],
      summary: "Inbound sales enquiry processed and recorded.",
    };
  }
}

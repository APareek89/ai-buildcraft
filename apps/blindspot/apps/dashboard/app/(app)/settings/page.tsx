import { PageError } from "@/components/PageError";
import { requireApi } from "@/lib/session";
import { SettingsView } from "./SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const client = await requireApi();
  try {
    const [pk, gk, settings, registry] = await Promise.all([
      client.listProviderKeys(),
      client.listGatewayKeys(),
      client.settings(),
      client.modelRegistry(),
    ]);
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Settings</h1>
            <p>Your BYO provider keys (encrypted at rest), gateway keys, and cost guardrails.</p>
          </div>
        </div>
        <SettingsView
          providerKeys={pk.provider_keys}
          gatewayKeys={gk.keys}
          settings={settings}
          registry={registry}
        />
      </>
    );
  } catch (e) {
    return <PageError error={e} />;
  }
}

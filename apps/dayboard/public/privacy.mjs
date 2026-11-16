import {TEAM_CONFIG} from './team-config.mjs';
import {applyDisplayPreferences, readDisplayPreferences} from './display.mjs';

// Read only display preferences. This page never reads or uploads a board,
// instantiates an Auth client, or makes a backend request.
try { applyDisplayPreferences(readDisplayPreferences(window.localStorage)); }
catch { /* The document is readable without browser storage. */ }

if (TEAM_CONFIG.enabled === true) {
  document.querySelector('#status-title').textContent = 'Personal mode and an invitation-only shared pilot';
  document.querySelector('#sharing-status').textContent = 'A personal board stays in this browser. Hosted workspaces are available only to approved organizers and invited members. Signing in does not upload your personal board; you choose any content to copy.';
  const emailProvider = typeof TEAM_CONFIG.emailProvider === 'string' ? TEAM_CONFIG.emailProvider.trim() : '';
  document.querySelector('#email-provider-notice').textContent = emailProvider
    ? `Sign-in email is delivered through ${emailProvider}. The delivery provider processes your destination email address and the sign-in message, including its access link, to send and protect delivery of that message. A sign-in message does not include your board content.`
    : 'The sign-in email provider has not been identified in this build. Shared sign-in must remain unavailable until the provider is identified and delivery is verified. Email delivery processes the destination address and sign-in message, including its access link.';
}

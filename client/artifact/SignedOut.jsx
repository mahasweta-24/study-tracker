import { Logo } from '../src/components/Logo.jsx';
// Shown instead of the email/password screen when the artifact has no signed-in viewer.
export default function SignedOut() {
  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand big"><Logo size={40} /><span>Study Tracker</span></div>
        <h1>Two roadmaps. One place to stay on track.</h1>
        <ul className="auth-points">
          <li><span className="dot pbi" /> <div><strong>Power BI · 100 days</strong><p>A calendar that schedules every day from your start date, and shifts the plan when life happens.</p></div></li>
          <li><span className="dot cs" /> <div><strong>Sales &amp; Marketing · 41 cases, 13 weeks</strong><p>A weekly board. Roll unfinished cases into next week or push whole weeks ahead.</p></div></li>
          <li><span className="dot log" /> <div><strong>Every change has a reason</strong><p>Each completion or shift asks for a short message, so your history explains itself.</p></div></li>
        </ul>
      </section>
      <section className="auth-card">
        <h2>Sign in to claude.ai to start</h2>
        <p className="muted">Your progress is saved to your claude.ai account. Open this page while signed in to claude.ai to set your start dates and track your days.</p>
      </section>
    </div>
  );
}

import { Link } from "react-router-dom";

import CallOutlinedIcon from "@mui/icons-material/CallOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";

import { LeafLogoMark } from "@components/shared/Icons/Icons";

import styles from "./HelpSupportPage.module.scss";

type SupportLine = {
  name: string;
  hours: string;
  blurb: string;
} & ({ tel: string; display: string } | { sms: string; smsBody: string; display: string });

// UK crisis lines. A fixed list rather than a per-practice resource so the
// numbers are always correct and always reachable, in and out of session.
const LINES: SupportLine[] = [
  {
    name: "Samaritans",
    tel: "116123",
    display: "116 123",
    hours: "24 hours a day, every day",
    blurb: "Free to call from any phone. You don't have to be suicidal to get in touch.",
  },
  {
    name: "NHS 111 — option 2",
    tel: "111",
    display: "111",
    hours: "24 hours a day, every day",
    blurb: "Urgent NHS mental health support, for you or someone you're worried about.",
  },
  {
    name: "Shout",
    sms: "85258",
    smsBody: "SHOUT",
    display: "Text SHOUT to 85258",
    hours: "24/7 text support",
    blurb: "Free and confidential, if you'd rather not speak on the phone.",
  },
  {
    name: "CALM",
    tel: "08005858585",
    display: "0800 58 58 58",
    hours: "5pm to midnight, every day",
    blurb: "The Campaign Against Living Miserably — a helpline for anyone who is struggling.",
  },
];

function lineHref(line: SupportLine): string {
  return "tel" in line ? `tel:${line.tel}` : `sms:${line.sms}?&body=${encodeURIComponent(line.smsBody)}`;
}

export default function HelpSupportPage() {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link to="/" className={styles.brand}>
          <LeafLogoMark size={22} />
          <span>Clarity</span>
        </Link>
        <Link to="/" className={styles.homeBtn}>
          Back to portal
        </Link>
      </header>

      <main className={styles.content}>
        <h1 className={styles.title}>Help &amp; support</h1>
        <p className={styles.intro}>
          Counselling isn't an emergency service, and there will be times between sessions when you need support sooner.
          The lines below are open when your counsellor isn't.
        </p>

        <section className={styles.emergency}>
          <p className={styles.emergencyLabel}>In immediate danger</p>
          <p className={styles.emergencyText}>If your life is at risk, or you have seriously harmed yourself:</p>
          <a href="tel:999" className={styles.emergencyCall}>
            <CallOutlinedIcon fontSize="small" />
            Call 999
          </a>
          <p className={styles.emergencyText}>&hellip; or go to your nearest A&amp;E.</p>
        </section>

        <h2 className={styles.sectionHead}>Support lines</h2>
        <ul className={styles.lines}>
          {LINES.map((line) => (
            <li key={line.name} className={styles.line}>
              <div className={styles.lineText}>
                <h3 className={styles.lineName}>{line.name}</h3>
                <p className={styles.lineBlurb}>{line.blurb}</p>
                <p className={styles.lineHours}>{line.hours}</p>
              </div>
              <a href={lineHref(line)} className={styles.lineAction}>
                {"tel" in line ? (
                  <CallOutlinedIcon fontSize="small" />
                ) : (
                  <ChatBubbleOutlineOutlinedIcon fontSize="small" />
                )}
                <span>{line.display}</span>
              </a>
            </li>
          ))}
        </ul>

        <p className={styles.footNote}>
          If it isn't urgent, contact your GP and ask for an urgent appointment, or bring it to your next session.
        </p>
      </main>
    </div>
  );
}

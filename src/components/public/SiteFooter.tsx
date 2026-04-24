import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site">
      <div className="brand">
        <span className="dot" />cancerstudio · v0.6
      </div>
      <div className="links">
        <Link href="/">Overview</Link>
        <Link href="/archive">Archive</Link>
        <Link href="/mission">Mission</Link>
        <a href="https://github.com/Niach/cancerstudio" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </footer>
  );
}

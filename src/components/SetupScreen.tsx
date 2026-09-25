import Link from "next/link";
import { tr, type Lang } from "@/lib/i18n";
import InitDbButton from "@/components/InitDbButton";

export default function SetupScreen({
  lang,
  missing,
  dbReady,
  isAdmin,
  dbError,
}: {
  lang: Lang;
  missing: string[];
  dbReady: boolean;
  isAdmin: boolean;
  dbError?: string;
}) {
  const t = (k: string) => tr(lang, k);
  return (
    <div className="page">
      <div className="narrow">
        <div className="panel">
          <h1 className="contest-title">🧠 {t("setupTitle")}</h1>
          {missing.length > 0 && (
            <>
              <p className="how">{t("setupText")}</p>
              <ul className="setup-list how">
                {missing.map((m) => (
                  <li key={m}>
                    <code>{m}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!missing.length && !dbReady && (
            <>
              <p className="how">{t("dbNotReady")}</p>
              {dbError && <p className="how" style={{ opacity: 0.7, fontSize: 12 }}>{dbError}</p>}
              {isAdmin ? (
                <InitDbButton label={t("initDb")} />
              ) : (
                <Link className="btn btn-yellow" href="/admin">
                  {t("adminLogin")}
                </Link>
              )}
              <p className="how">{t("runSql")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

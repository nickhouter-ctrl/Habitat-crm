"use client";

/**
 * Vangnet voor fouten in de root layout zelf. Vervangt de hele pagina, dus
 * eigen <html>/<body> en inline styles — globals.css is hier niet geladen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="nl">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          background: "#faf9f7",
          color: "#292524",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Er ging iets mis</h1>
          <p style={{ fontSize: 14, color: "#78716c" }}>
            De applicatie kon deze pagina niet laden.
            {error.digest ? ` Foutcode: ${error.digest}` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #d6d3d1",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      </body>
    </html>
  );
}

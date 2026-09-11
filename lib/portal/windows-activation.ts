/** Activatie voor het kozijnenportaal; link blijft op de Windows-site. */
export function windowsActivationMail(name: string, token: string, locale: string | null) {
  const language = locale === "nl" || locale === "es" || locale === "de" ? locale : "en";
  const messages = {
    nl: { subject: "Habitat Windows — stel je wachtwoord in", hello: "Beste", body: "Je aanvraag voor het kozijnensysteem is goedgekeurd. Kies via de knop je wachtwoord. Daarna log je bij Habitat Windows in met je e-mailadres en dat wachtwoord. Je hebt geen aparte inlogcode nodig.", button: "Wachtwoord instellen", expiry: "Deze link is 7 dagen geldig." },
    en: { subject: "Habitat Windows — set your password", hello: "Hello", body: "Your Windows Portal application has been approved. Use the button to choose your password. Then sign in to Habitat Windows with your email address and that password. You do not need a separate login code.", button: "Set password", expiry: "This link is valid for 7 days." },
    es: { subject: "Habitat Windows — crea tu contraseña", hello: "Hola", body: "Tu solicitud de acceso al configurador ha sido aprobada. Elige tu contraseña con el botón. Después inicia sesión en Habitat Windows con tu correo y esa contraseña. No necesitas un código adicional.", button: "Crear contraseña", expiry: "Este enlace es válido durante 7 días." },
    de: { subject: "Habitat Windows — Passwort festlegen", hello: "Hallo", body: "Dein Antrag für das Fensterportal wurde genehmigt. Lege über die Schaltfläche dein Passwort fest. Melde dich danach mit deiner E-Mail-Adresse und diesem Passwort bei Habitat Windows an. Ein zusätzlicher Anmeldecode ist nicht erforderlich.", button: "Passwort festlegen", expiry: "Dieser Link ist 7 Tage gültig." },
  };
  const m = messages[language];
  const link = `https://windows.habitat-one.com/activate?token=${encodeURIComponent(token)}&lang=${language === "de" ? "en" : language}`;
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return { subject: m.subject, html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2>Habitat Windows</h2><p>${m.hello} ${escape(name)},</p><p>${m.body}</p><p><a href="${link}">${m.button}</a></p><p>${m.expiry}</p></div>`, text: `${m.hello} ${name},\n\n${m.body}\n\n${link}\n\n${m.expiry}` };
}

export function windowsAccessReadyMail(locale: string | null) {
 const m = {
  nl: ["Habitat Windows — toegang goedgekeurd", "Je hebt nu toegang tot Habitat Windows. Log in met het e-mailadres en wachtwoord van je bestaande Habitat-account."],
  en: ["Habitat Windows — access approved", "You now have access to Habitat Windows. Sign in with the email address and password of your existing Habitat account."],
  es: ["Habitat Windows — acceso aprobado", "Ya tienes acceso a Habitat Windows. Inicia sesión con el correo y la contraseña de tu cuenta Habitat existente."],
  de: ["Habitat Windows — Zugang genehmigt", "Du hast jetzt Zugang zu Habitat Windows. Melde dich mit der E-Mail-Adresse und dem Passwort deines bestehenden Habitat-Kontos an."],
 }[locale === "nl" || locale === "es" || locale === "de" ? locale : "en"];
 const link = "https://windows.habitat-one.com/login";
 return { subject: m[0], text: `${m[1]}\n\n${link}`, html: `<p>${m[1]}</p><p><a href="${link}">Habitat Windows</a></p>` };
}

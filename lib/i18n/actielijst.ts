/** Schermteksten van de gedeelde actielijst (/actielijst) en de mail bij een
 *  gemiste deadline. Rijen: [Nederlands (sleutel), English, Español]. */
const rows: [string, string, string][] = [
  ["Actielijst", "Action list", "Lista de acciones"],
  ["Interne acties met verantwoordelijke en deadline", "Internal actions with an owner and a deadline", "Acciones internas con responsable y fecha límite"],
  ["Wat er moet gebeuren, wie het oppakt en wanneer het klaar moet zijn. Iedereen die met de lijst werkt kan punten toevoegen, bijwerken, opmerkingen plaatsen en afvinken.", "What needs doing, who picks it up and when it has to be finished. Everyone who works with the list can add items, update them, leave comments and tick them off.", "Qué hay que hacer, quién se encarga y cuándo debe estar listo. Todo el que trabaja con la lista puede añadir puntos, actualizarlos, dejar comentarios y marcarlos como hechos."],
  ["Nieuw actiepunt", "New action item", "Nuevo punto de acción"],
  ["Actiepunt", "Action item", "Punto de acción"],
  ["Actiepunt toevoegen", "Add action item", "Añadir punto de acción"],

  // ── lijst, filters en legenda ──────────────────────────────────────────────
  ["Open punten", "Open items", "Puntos pendientes"],
  ["Alles, ook afgerond", "Everything, including finished", "Todo, incluido lo terminado"],
  ["Uit de lijst gehaald", "Removed from the list", "Quitados de la lista"],
  ["Alleen van mij", "Only mine", "Solo los míos"],
  ["Van iedereen", "Everyone’s", "De todos"],
  ["Van mij", "Mine", "Míos"],
  ["Deadline verstreken", "Deadline passed", "Fecha límite vencida"],
  ["De verantwoordelijke krijgt hierover een aparte mail.", "The person responsible receives a separate email about this.", "La persona responsable recibe un correo aparte sobre esto."],
  ["De deadline van {datum} is verstreken. De verantwoordelijke krijgt hierover een mail.", "The deadline of {datum} has passed. The person responsible receives an email about it.", "La fecha límite del {datum} ha vencido. La persona responsable recibe un correo al respecto."],
  ["De deadline van {datum} is verstreken. Zonder verantwoordelijke gaat er geen mail uit.", "The deadline of {datum} has passed. Without someone responsible no email is sent.", "La fecha límite del {datum} ha vencido. Sin responsable no se envía ningún correo."],
  ["Rood = deadline verstreken · Oranje = iemand is ermee bezig · Groen = klaar", "Red = deadline passed · Amber = someone is working on it · Green = done", "Rojo = fecha límite vencida · Naranja = alguien está en ello · Verde = hecho"],
  ["Nog niemand", "Nobody yet", "Todavía nadie"],
  ["Samen met", "Together with", "Junto con"],
  ["Nog geen actiepunten.", "No action items yet.", "Todavía no hay puntos de acción."],
  ["Geen punten voor jou.", "No items for you.", "No hay puntos para ti."],
  ["Niets uit de lijst gehaald.", "Nothing removed from the list.", "No se ha quitado nada de la lista."],
  ["Zet erin wat er moet gebeuren — showroom, magazijn, logistiek, social media. Met een verantwoordelijke en een deadline erbij.", "Put in whatever needs following up — showroom, warehouse, logistics, social media. With someone responsible and a deadline.", "Añade todo lo que hay que seguir: showroom, almacén, logística, redes sociales. Con un responsable y una fecha límite."],

  // ── invoeren en bijwerken ─────────────────────────────────────────────────
  ["Groep", "Group", "Grupo"],
  ["Subgroep (optioneel)", "Subgroup (optional)", "Subgrupo (opcional)"],
  ["Bijvoorbeeld: Showroom, Magazijn, Logistiek, Social media", "For example: Showroom, Warehouse, Logistics, Social media", "Por ejemplo: showroom, almacén, logística, redes sociales"],
  ["Bijvoorbeeld: Stalen, Voorraadtelling, Signing", "For example: Samples, Stock count, Signage", "Por ejemplo: muestras, recuento de stock, rotulación"],
  ["Bijvoorbeeld: stalenkast opruimen en ordenen", "For example: tidy and sort the sample cabinet", "Por ejemplo: ordenar y organizar el mueble de muestras"],
  ["Toelichting (optioneel)", "Details (optional)", "Detalles (opcional)"],
  ["Wie pakt het op?", "Who picks it up?", "¿Quién se encarga?"],
  ["Samen met (optioneel)", "Together with (optional)", "Junto con (opcional)"],
  ["Wie er verder bij nodig is — ook iemand buiten het CRM.", "Who else is needed — including someone outside the CRM.", "Quién más hace falta, también alguien de fuera del CRM."],
  ["Staat de deadline op {datum} of eerder en is het punt dan nog niet afgevinkt, dan krijgt de verantwoordelijke daarover een aparte mail. Tijdzone: Madrid.", "If the deadline is {datum} or earlier and the item has not been ticked off, the person responsible gets a separate email about it. Time zone: Madrid.", "Si la fecha límite es el {datum} o anterior y el punto sigue sin marcarse, la persona responsable recibe un correo aparte. Zona horaria: Madrid."],
  ["Afvinken: {taak}", "Tick off: {taak}", "Marcar como hecho: {taak}"],
  ["Terugzetten: {taak}", "Restore: {taak}", "Restaurar: {taak}"],
  ["Uit de lijst halen", "Remove from the list", "Quitar de la lista"],
  ["Terugzetten in de lijst", "Restore to the list", "Devolver a la lista"],
  ["Uit de lijst halen laat het punt en de opmerkingen staan onder ‘Uit de lijst gehaald’.", "Removing it from the list keeps the item and its comments under “Removed from the list”.", "Al quitarlo de la lista, el punto y sus comentarios se conservan en «Quitados de la lista»."],

  ["Houdt de lijst bij", "Keeps the list", "Mantiene la lista"],
  ["Overige medewerkers (zien het in hun agenda)", "Other colleagues (they see it in their calendar)", "Otros compañeros (lo ven en su agenda)"],
  ["Een collega die de lijst niet bijhoudt, ziet dit punt alleen in de agenda. Zet er dus een deadline op, anders komt het nergens langs.", "A colleague who does not keep the list only sees this item in the calendar, so give it a deadline — otherwise it never comes up.", "Un compañero que no mantiene la lista solo ve este punto en la agenda, así que ponle una fecha límite; si no, no aparece en ningún sitio."],

  // ── persoonlijke links en agenda ──────────────────────────────────────────
  ["Persoonlijke links", "Personal links", "Enlaces personales"],
  ["Met deze link staat de lijst op de telefoon open zonder inloggen. De link is persoonlijk: afvinken en opmerkingen komen op naam. Maak een nieuwe link als iemand hem kwijt is — de oude werkt dan direct niet meer.", "With this link the list opens on a phone without logging in. The link is personal: ticking off and comments are recorded by name. Create a new link if someone loses theirs — the old one stops working immediately.", "Con este enlace la lista se abre en el móvil sin iniciar sesión. El enlace es personal: lo que marques y comentes queda a tu nombre. Crea un enlace nuevo si alguien lo pierde; el antiguo deja de funcionar al instante."],
  ["Nieuwe link", "New link", "Enlace nuevo"],
  ["Link kopiëren", "Copy link", "Copiar enlace"],
  ["Gekopieerd", "Copied", "Copiado"],
  ["Kopiëren lukte niet — selecteer de link zelf", "Copying failed — select the link yourself", "No se pudo copiar: selecciona el enlace tú mismo"],
  ["laatst geopend {wanneer}", "last opened {wanneer}", "abierto por última vez {wanneer}"],
  ["nog niet geopend", "not opened yet", "aún sin abrir"],
  ["Een punt met een deadline staat ook als taak in de teamagenda, en komt zo mee in je eigen agenda op de telefoon en in het ochtendoverzicht van 08:00.", "An item with a deadline also appears as a task in the team calendar, and so shows up in your own phone calendar and in the 08:00 morning overview.", "Un punto con fecha límite aparece también como tarea en la agenda del equipo, así que se ve en la agenda de tu móvil y en el resumen de las 08:00."],

  // ── opmerkingen ───────────────────────────────────────────────────────────
  ["Opmerking", "Comment", "Comentario"],
  ["Opmerkingen", "Comments", "Comentarios"],
  ["Opmerking plaatsen", "Add a comment", "Añadir un comentario"],
  ["Opmerking voor het team…", "Comment for the team…", "Comentario para el equipo…"],
  ["Nog geen opmerkingen.", "No comments yet.", "Todavía no hay comentarios."],
  ["Plaatsen…", "Posting…", "Publicando…"],

  // ── meldingen uit de server actions ───────────────────────────────────────
  ["Actiepunt toegevoegd.", "Action item added.", "Punto de acción añadido."],
  ["Actiepunt bijgewerkt.", "Action item updated.", "Punto de acción actualizado."],
  ["Actiepunt stond al in de lijst.", "The action item was already in the list.", "El punto ya estaba en la lista."],
  ["Actiepunt niet gevonden.", "Action item not found.", "Punto de acción no encontrado."],
  ["Actiepunt niet bijgewerkt. Probeer het opnieuw.", "Action item not updated. Please try again.", "No se ha actualizado el punto. Inténtalo de nuevo."],
  ["Actiepunt niet opgeslagen. Controleer de groep, het actiepunt en de deadline.", "Action item not saved. Check the group, the item and the deadline.", "No se ha guardado el punto. Comprueba el grupo, el punto y la fecha límite."],
  ["Kies een geldige deadline.", "Choose a valid deadline.", "Elige una fecha límite válida."],
  ["Deze medewerker kan de actielijst niet bijwerken. Kies een andere verantwoordelijke.", "This colleague cannot update the action list. Choose someone else as responsible.", "Este compañero no puede actualizar la lista de acciones. Elige otro responsable."],
  ["Opmerking geplaatst.", "Comment added.", "Comentario añadido."],
  ["Opmerking niet geplaatst. Probeer het opnieuw.", "Comment not added. Please try again.", "No se ha añadido el comentario. Inténtalo de nuevo."],

  // ── de mail bij een gemiste deadline ──────────────────────────────────────
  ["Actie nodig – {taak} is nog niet uitgevoerd", "Action needed – {taak} has not been done yet", "Se requiere acción – {taak} aún no se ha hecho"],
  ["Deze taak uit de gedeelde actielijst staat na de deadline nog open. Vink hem af zodra hij klaar is, of zet er een nieuwe deadline op.", "This task from the shared action list is still open after its deadline. Tick it off once it is done, or set a new deadline.", "Esta tarea de la lista de acciones compartida sigue pendiente después de la fecha límite. Márcala cuando esté hecha o ponle una nueva fecha."],
  ["Gemiste deadline: {datum}", "Missed deadline: {datum}", "Fecha límite incumplida: {datum}"],
  ["Open het actiepunt", "Open the action item", "Abrir el punto de acción"],
];

export const actielijstEn: Record<string, string> = Object.fromEntries(rows.map(([nl, en]) => [nl, en]));
export const actielijstEs: Record<string, string> = Object.fromEntries(rows.map(([nl, , es]) => [nl, es]));

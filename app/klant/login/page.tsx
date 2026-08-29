import { redirect } from "next/navigation";

/** /klant/login zonder token (klant kortte de mail-URL in) → startpagina. */
export default function KlantLoginZonderToken() {
  redirect("/klant");
}

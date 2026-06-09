import { redirect } from "next/navigation";

/**
 * "Deals" is uit het CRM gehaald — offertes staan op zichzelf en grotere klussen
 * lopen via Projecten. Oude /deals-links sturen we door naar /projects.
 */
export default function DealsRedirect() {
  redirect("/projects");
}

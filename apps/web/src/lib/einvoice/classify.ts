import type { ElectronicInvoiceModel, ElectronicMarket, ElectronicParty, ElectronicRoute } from "./types";

function isFr(code: string | null | undefined) {
  return code?.toUpperCase() === "FR";
}

function countryOf(party: ElectronicParty) {
  return party.countryCode || party.address?.countryCode || null;
}

function marketOf(seller: ElectronicParty, buyer: ElectronicParty): ElectronicMarket {
  const sellerCountry = countryOf(seller);
  const buyerCountry = countryOf(buyer);
  const person = buyer.partyKind === "PERSON";
  const company = buyer.partyKind === "COMPANY";
  if (!isFr(sellerCountry) || (!person && !company) || !buyerCountry) return "UNKNOWN";
  if (person && isFr(buyerCountry)) return "B2C_FR";
  if (person) return "B2C_INTL";
  if (company && isFr(buyerCountry)) return "B2B_FR";
  return "B2B_INTL";
}

function routeOf(status: string, market: ElectronicMarket, buyer: ElectronicParty): ElectronicRoute {
  if (status !== "SENT") return "OUT_OF_SCOPE";
  if (market === "UNKNOWN") return "REVIEW_REQUIRED";
  if (market === "B2B_FR") {
    if (buyer.taxablePerson === true) return "E_INVOICING";
    return "REVIEW_REQUIRED";
  }
  if (market === "B2B_INTL") {
    if (buyer.taxablePerson === true) return "E_REPORTING";
    return "REVIEW_REQUIRED";
  }
  if (market === "B2C_FR" || market === "B2C_INTL") return "E_REPORTING";
  return "REVIEW_REQUIRED";
}

export function classifyElectronicInvoice(model: Pick<ElectronicInvoiceModel, "document" | "seller" | "buyer">): {
  route: ElectronicRoute;
  market: ElectronicMarket;
} {
  const market = marketOf(model.seller, model.buyer);
  return { market, route: routeOf(model.document.status, market, model.buyer) };
}

export const classificationInputs = [
  "document.status",
  "seller.countryCode",
  "buyer.partyKind",
  "buyer.countryCode",
  "buyer.taxablePerson",
] as const;

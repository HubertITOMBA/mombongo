import { Component, useEffect, useState, type ComponentProps, type ErrorInfo, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { formatDateTime, pipelineStageLabels, pipelineStages, roleLabels, settlementStateLabels, electronicTransmissionStatusLabels } from "@mombongo/contracts";
import {
  ApiError, acceptQuote, addNote, apiUrl, convertQuote, createAppointment, createQuote, loadAppointments, loadCatalog, loadCustomers, loadDashboard, loadInvoices, loadPipeline, loadQuotes, logout, moveStage, sendQuote,
  resendCode, startLogin, startRegister, switchOrganization, verifyCode,
  type AppointmentItem, type CatalogOption, type CustomerOption, type Dashboard, type InvoiceItem, type PipelineColumns, type QuoteItem,
} from "./src/api";
import { readSession } from "./src/session";

type Screen = "auth" | "verify" | "dashboard" | "pipeline" | "agenda" | "quotes" | "invoices";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[mombongo] render", error.message, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff7ed", padding: 24 }}>
        <Text style={{ fontWeight: "700", fontSize: 18, color: "#9a3412" }}>Erreur de rendu</Text>
        <Text selectable style={{ marginTop: 12, color: "#9a3412" }}>{this.state.error.message}</Text>
        <Text selectable style={{ marginTop: 12, fontSize: 12, color: "#7c2d12" }}>{this.state.error.stack}</Text>
      </SafeAreaView>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoot />
    </ErrorBoundary>
  );
}

function AppRoot() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountType, setAccountType] = useState<"INDIVIDUAL" | "BUSINESS">("BUSINESS");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [pipeline, setPipeline] = useState<PipelineColumns | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [catalogItemId, setCatalogItemId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    console.log("[mombongo] AppRoot mounted", apiUrl);
    let cancelled = false;
    (async () => {
      try {
        const session = await readSession();
        if (!session) return;
        try {
          const next = await loadDashboard();
          if (!cancelled) {
            setDashboard(next);
            setScreen("dashboard");
          }
        } catch (caught) {
          console.error("[mombongo] dashboard", caught);
          if (!cancelled) {
            setError(caught instanceof ApiError || caught instanceof Error ? caught.message : "Tableau de bord indisponible.");
          }
          try {
            await logout();
          } catch (logoutError) {
            console.error("[mombongo] logout", logoutError);
          }
        }
      } catch (caught) {
        console.error("[mombongo] session", caught);
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Erreur de session SecureStore.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const operate = canOperate(dashboard?.role);

  async function run(task: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  function start() {
    return run(async () => {
      const started = mode === "login"
        ? await startLogin(email, password)
        : await startRegister({ email, password, name, accountType, ...(accountType === "BUSINESS" ? { organizationName } : {}) });
      setChallengeToken(started.challengeToken);
      setCode("");
      setScreen("verify");
    });
  }

  function confirm() {
    return run(async () => {
      await verifyCode(challengeToken, code);
      setDashboard(await loadDashboard());
      setScreen("dashboard");
    });
  }

  if (busy && !dashboard && screen !== "verify") {
    return (
      <SafeAreaView style={styles.center}>
        <BrandFrame size="hero" />
        {error ? (
          <Text style={[styles.error, { marginTop: 16, paddingHorizontal: 24, textAlign: "center" }]}>{error}</Text>
        ) : (
          <ActivityIndicator color="#065f46" style={{ marginTop: 16 }} />
        )}
        <Text style={[styles.note, { marginTop: 12 }]}>{apiUrl}</Text>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <BrandFrame size={screen === "auth" || screen === "verify" ? "hero" : "header"} />
        {screen === "auth" && (
          <View style={styles.card}>
            <Text style={styles.title}>{mode === "login" ? "Heureux de vous retrouver" : "Créer votre espace"}</Text>
            {mode === "register" && (
              <>
                <View style={styles.row}>
                  <Choice label="Particulier" active={accountType === "INDIVIDUAL"} onPress={() => setAccountType("INDIVIDUAL")} />
                  <Choice label="Entreprise" active={accountType === "BUSINESS"} onPress={() => setAccountType("BUSINESS")} />
                </View>
                <Field label="Votre nom" value={name} onChangeText={setName} />
                {accountType === "BUSINESS" && <Field label="Nom de votre entreprise" value={organizationName} onChangeText={setOrganizationName} />}
              </>
            )}
            <Field label="Adresse email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Field
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              reveal={{
                visible: passwordVisible,
                onToggle: () => setPasswordVisible(value => !value),
              }}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Action label={busy ? "Veuillez patienter…" : mode === "login" ? "Continuer" : "Créer mon espace"} onPress={start} disabled={busy} />
            <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              <Text style={styles.link}>{mode === "login" ? "Créer un compte" : "J’ai déjà un compte"}</Text>
            </Pressable>
          </View>
        )}
        {screen === "verify" && (
          <View style={styles.card}>
            <Text style={styles.title}>Vérifions que c’est bien vous</Text>
            <Text style={styles.lead}>Saisissez le code reçu. En local, utilisez npm run mail:local.</Text>
            <Field label="Code de vérification" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Action label={busy ? "Vérification…" : "Valider et accéder"} onPress={confirm} disabled={busy || code.length !== 6} />
            <Pressable onPress={() => run(() => resendCode(challengeToken))}>
              <Text style={styles.link}>Renvoyer un code</Text>
            </Pressable>
            <Pressable onPress={() => { setScreen("auth"); setError(""); }}>
              <Text style={styles.link}>Recommencer</Text>
            </Pressable>
          </View>
        )}
        {screen === "dashboard" && dashboard && (
          <View style={styles.screen}>
            <Text style={styles.kicker}>{dashboard.accountType === "INDIVIDUAL" ? "Espace particulier" : "Espace entreprise"}</Text>
            <Text style={styles.title}>Bonjour {dashboard.name || "et bienvenue"}.</Text>
            <Text style={styles.lead}>
              {dashboard.organizationName ? `${dashboard.organizationName} · ${dashboard.role ? roleLabels[dashboard.role as keyof typeof roleLabels] : ""}` : dashboard.email}
              {dashboard.appointments.upcoming ? ` · ${dashboard.appointments.upcoming} RDV à venir` : ""}
            </Text>
            {dashboard.accountType === "BUSINESS" && (dashboard.organizations ?? []).length > 1 && (
              <View style={styles.row}>
                {(dashboard.organizations ?? []).map(organization => (
                  <Choice
                    key={organization.id}
                    label={organization.name}
                    active={dashboard.organizationId === organization.id}
                    onPress={() => run(async () => {
                      await switchOrganization(organization.id);
                      setDashboard(await loadDashboard());
                    })}
                  />
                ))}
              </View>
            )}
            <View style={styles.grid}>
              <Metric icon="cash-outline" label="CA du mois" value={money(dashboard.invoices.monthRevenue)} />
              <Metric icon="document-text-outline" label="Devis ouverts" value={String(dashboard.quotes?.open ?? dashboard.invoices.pending)} />
              <Metric icon="receipt-outline" label="Factures émises" value={String(dashboard.invoices.pending)} />
              <Metric icon="alert-circle-outline" label="En retard" value={String(dashboard.invoices.overdue)} />
              <Metric icon="card-outline" label="Dépenses" value={money(dashboard.expenses.month)} />
              <Metric icon="people-outline" label="Clients" value={String(dashboard.customers.clients)} />
              <Metric icon="sparkles-outline" label="Prospects" value={String(dashboard.customers.prospects)} />
            </View>
            <View style={styles.toolbar}>
              {dashboard.accountType === "BUSINESS" && (
                <>
                  <IconAction name="git-network-outline" label="Pipeline" onPress={() => run(async () => { setPipeline((await loadPipeline()).columns); setScreen("pipeline"); })} disabled={busy} />
                  <IconAction name="calendar-outline" label="Agenda" onPress={() => run(async () => { setAppointments(await loadAppointments()); setScreen("agenda"); })} disabled={busy} />
                  <IconAction name="document-text-outline" label="Devis" onPress={() => run(async () => { const [nextQuotes, nextCustomers, nextCatalog] = await Promise.all([loadQuotes(), loadCustomers(), loadCatalog()]); setQuotes(nextQuotes); setCustomers(nextCustomers); setCatalog(nextCatalog); setCatalogItemId(""); setCustomerId(nextCustomers[0]?.id ?? ""); setScreen("quotes"); })} disabled={busy} />
                  <IconAction name="receipt-outline" label="Factures" onPress={() => run(async () => { setInvoices(await loadInvoices()); setScreen("invoices"); })} disabled={busy} />
                </>
              )}
              <IconAction name="log-out-outline" label="Sortir" tone="muted" onPress={() => run(async () => { await logout(); setDashboard(null); setScreen("auth"); })} disabled={busy} />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
        {screen === "pipeline" && pipeline && (
          <View style={styles.screen}>
            <Text style={styles.title}>Pipeline</Text>
            {pipelineStages.map(stage => (
              <View key={stage} style={styles.card}>
                <Text style={styles.label}>{pipelineStageLabels[stage]} ({pipeline[stage]?.length ?? 0})</Text>
                {(pipeline[stage] ?? []).map(card => (
                  <View key={card.id} style={styles.cardItem}>
                    <Text style={styles.cardTitle}>{card.displayName}</Text>
                    {card.nextAction ? <Text style={styles.note}>{card.nextAction}</Text> : null}
                    {operate && (
                      <>
                        <View style={styles.row}>
                          {pipelineStages.filter(option => option !== stage).slice(0, 3).map(option => (
                            <Choice key={option} label={pipelineStageLabels[option]} active={false} onPress={() => run(async () => {
                              await moveStage(card.id, option);
                              setPipeline((await loadPipeline()).columns);
                            })} />
                          ))}
                        </View>
                        <Field label="Note" value={note} onChangeText={setNote} />
                        <Action label="Ajouter une note" onPress={() => run(async () => {
                          await addNote(card.id, note);
                          setNote("");
                          setPipeline((await loadPipeline()).columns);
                        })} disabled={busy || note.trim().length < 2} />
                      </>
                    )}
                  </View>
                ))}
              </View>
            ))}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.toolbar}>
              <IconAction name="home-outline" label="Accueil" onPress={() => run(async () => { setDashboard(await loadDashboard()); setScreen("dashboard"); })} disabled={busy} />
            </View>
          </View>
        )}
        {screen === "quotes" && (
          <View style={styles.screen}>
            <Text style={styles.title}>Devis</Text>
            {operate && <View style={styles.card}>
              <Text style={styles.label}>Destinataire</Text>
              <View style={styles.row}>
                {customers.slice(0, 2).map(item => (
                  <Choice key={item.id} label={item.displayName} active={customerId === item.id} onPress={() => setCustomerId(item.id)} />
                ))}
              </View>
              <Field label="Titre" value={title} onChangeText={setTitle} />
              {catalog.length > 0 && (
                <>
                  <Text style={styles.label}>Produit ou service</Text>
                  <View style={styles.row}>
                    <Choice label="Ligne libre" active={catalogItemId === ""} onPress={() => setCatalogItemId("")} />
                    {catalog.slice(0, 3).map(item => (
                      <Choice
                        key={item.id}
                        label={item.name}
                        active={catalogItemId === item.id}
                        onPress={() => {
                          setCatalogItemId(item.id);
                          setDescription((item.description && item.description.trim().length >= 2) ? item.description : item.name);
                          setPrice(String(item.unitPriceCents / 100));
                        }}
                      />
                    ))}
                  </View>
                </>
              )}
              <Field label="Ligne" value={description} onChangeText={setDescription} />
              <Field label="Prix HT" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
              <Action label="Créer le brouillon" onPress={() => run(async () => {
                const selected = catalog.find(item => item.id === catalogItemId);
                await createQuote({
                  customerId,
                  title,
                  description,
                  quantity: 1,
                  unitPriceCents: price,
                  vatBps: selected?.vatBps ?? 2000,
                  unit: selected?.unit,
                  itemKind: selected?.itemKind,
                  catalogItemId: catalogItemId || undefined,
                });
                setTitle("");
                setDescription("");
                setPrice("");
                setCatalogItemId("");
                setQuotes(await loadQuotes());
              })} disabled={busy || !customerId || title.trim().length < 2 || description.trim().length < 2 || !price} />
            </View>}
            {quotes.map(item => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.note}>{item.number || "Brouillon"} · {item.status} · {item.customerName} · {money(item.ttcCents, item.currency)}</Text>
                {operate && item.status === "DRAFT" && (
                  <Action label="Envoyer" onPress={() => run(async () => { await sendQuote(item.id); setQuotes(await loadQuotes()); })} disabled={busy} />
                )}
                {operate && item.status === "SENT" && (
                  <Action label="Marquer accepté" onPress={() => run(async () => { await acceptQuote(item.id); setQuotes(await loadQuotes()); })} disabled={busy} />
                )}
                {operate && item.status === "ACCEPTED" && !item.invoiceId && (
                  <Action label="Créer la facture" onPress={() => run(async () => { await convertQuote(item.id); setQuotes(await loadQuotes()); setInvoices(await loadInvoices()); })} disabled={busy} />
                )}
                {item.invoiceNumber ? <Text style={styles.note}>Facture {item.invoiceNumber}</Text> : null}
              </View>
            ))}
            {quotes.length === 0 && <Text style={styles.note}>Aucun devis pour le moment.</Text>}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.toolbar}>
              <IconAction name="home-outline" label="Accueil" onPress={() => run(async () => { setDashboard(await loadDashboard()); setScreen("dashboard"); })} disabled={busy} />
            </View>
          </View>
        )}
        {screen === "invoices" && (
          <View style={styles.screen}>
            <Text style={styles.title}>Factures</Text>
            {invoices.map(item => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.number || item.title}</Text>
                <Text style={styles.note}>
                  {item.status === "SENT" ? "Émise" : item.status === "CANCELLED" ? "Annulée (historique)" : item.status}
                  {item.settlementState ? ` · ${settlementStateLabels[item.settlementState]}` : ""}
                  {item.electronicTransmissionStatus
                    ? ` · Transmission : ${electronicTransmissionStatusLabels[item.electronicTransmissionStatus as keyof typeof electronicTransmissionStatusLabels] ?? item.electronicTransmissionStatus}`
                    : ""}
                  {" · "}{item.customerName} · {money(item.ttcCents, item.currency)}
                  {item.remainingTtcCents != null ? ` · reste ${money(item.remainingTtcCents, item.currency)}` : ""}
                  {item.sourceNumber ? ` · depuis ${item.sourceNumber}` : ""}
                </Text>
              </View>
            ))}
            {invoices.length === 0 && <Text style={styles.note}>Aucune facture pour le moment.</Text>}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.toolbar}>
              <IconAction name="home-outline" label="Accueil" onPress={() => run(async () => { setDashboard(await loadDashboard()); setScreen("dashboard"); })} disabled={busy} />
            </View>
          </View>
        )}
        {screen === "agenda" && (
          <View style={styles.screen}>
            <Text style={styles.title}>Agenda</Text>
            {operate && <View style={styles.card}>
              <Field label="Titre" value={title} onChangeText={setTitle} />
              <Field label="Début (JJ-MM-AAAA HH:MM)" value={startsAt} onChangeText={setStartsAt} placeholder="25-09-2026 14:00" autoCapitalize="none" />
              <Action label="Planifier 30 min" onPress={() => run(async () => {
                await createAppointment({ title, startsAt, durationMinutes: 30 });
                setTitle("");
                setAppointments(await loadAppointments());
              })} disabled={busy || title.trim().length < 2 || startsAt.length < 16} />
            </View>}
            {appointments.map(item => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.note}>{formatDateTime(item.startsAt)} · {item.customerName || "Sans fiche"}</Text>
              </View>
            ))}
            {appointments.length === 0 && <Text style={styles.note}>Aucun rendez-vous à venir.</Text>}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.toolbar}>
              <IconAction name="home-outline" label="Accueil" onPress={() => run(async () => { setDashboard(await loadDashboard()); setScreen("dashboard"); })} disabled={busy} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function canOperate(role?: string | null) {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

function money(cents: number, currency = "EUR") {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: code }).format(cents / 100);
}

function BrandFrame({ size }: { size: "hero" | "header" }) {
  return (
    <View style={[styles.brandFrame, size === "hero" ? styles.brandFrameHero : styles.brandFrameHeader]}>
      <Image
        source={require("./assets/wordmark.png")}
        style={size === "hero" ? styles.brandHero : styles.brandHeader}
        accessibilityLabel="Mombongo"
      />
    </View>
  );
}

function Field({
  label,
  reveal,
  ...input
}: {
  label: string;
  reveal?: { visible: boolean; onToggle: () => void };
} & Partial<ComponentProps<typeof TextInput>>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput {...input} style={[styles.input, reveal ? styles.inputWithReveal : null]} placeholderTextColor="#94a3b8" />
        {reveal && (
          <Pressable
            onPress={reveal.onToggle}
            style={styles.reveal}
            accessibilityRole="button"
            accessibilityLabel={reveal.visible ? `Masquer : ${label}` : `Afficher : ${label}`}
            accessibilityState={{ selected: reveal.visible }}
          >
            <Ionicons name={reveal.visible ? "eye-off-outline" : "eye-outline"} size={22} color="#047857" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, disabled && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function IconAction({ name, label, onPress, disabled, tone = "primary" }: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "muted";
}) {
  const [hint, setHint] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHint(true)}
      onHoverOut={() => setHint(false)}
      onLongPress={() => {
        setHint(true);
        setTimeout(() => setHint(false), 1600);
      }}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconAction, tone === "muted" && styles.iconActionMuted, disabled && styles.buttonDisabled]}
    >
      <Ionicons name={name} size={22} color={tone === "muted" ? "#334155" : "#065f46"} />
      {hint ? <Text style={styles.iconHint} numberOfLines={1}>{label}</Text> : null}
    </Pressable>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color="#047857" />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ecfdf5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#ecfdf5" },
  page: { padding: 20, gap: 18, paddingBottom: 40 },
  brandFrame: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1fae5",
    shadowColor: "#065f46",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    alignSelf: "center",
  },
  brandFrameHero: { borderRadius: 28, padding: 16 },
  brandFrameHeader: { borderRadius: 18, padding: 8, alignSelf: "flex-start" },
  brandHero: { width: 252, height: 168, resizeMode: "contain" },
  brandHeader: { width: 108, height: 72, resizeMode: "contain" },
  screen: { gap: 16 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 18, gap: 12, borderWidth: 1, borderColor: "#d1fae5", shadowColor: "#065f46", shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  cardItem: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#ecfdf5" },
  cardTitle: { fontWeight: "700", color: "#0f172a", fontSize: 16 },
  kicker: { fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#047857" },
  title: { fontSize: 28, fontWeight: "700", color: "#0f172a" },
  lead: { fontSize: 15, lineHeight: 22, color: "#64748b" },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  inputWrap: { position: "relative", justifyContent: "center" },
  input: { height: 48, borderWidth: 1, borderColor: "#a7f3d0", borderRadius: 14, paddingHorizontal: 12, backgroundColor: "#fff", color: "#0f172a" },
  inputWithReveal: { paddingRight: 48 },
  reveal: { position: "absolute", right: 0, top: 0, height: 48, width: 48, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, borderWidth: 1, borderColor: "#a7f3d0", borderRadius: 12, padding: 12, alignItems: "center", backgroundColor: "#fff" },
  choiceActive: { borderColor: "#047857", backgroundColor: "#d1fae5" },
  choiceText: { fontWeight: "600", color: "#334155" },
  choiceTextActive: { color: "#065f46" },
  button: { backgroundColor: "#065f46", borderRadius: 14, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700" },
  toolbar: { flexDirection: "row", gap: 10, justifyContent: "center", overflow: "visible" },
  iconAction: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#a7f3d0", alignItems: "center", justifyContent: "center", overflow: "visible" },
  iconActionMuted: { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  iconHint: {
    position: "absolute",
    bottom: 54,
    backgroundColor: "#0f172a",
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    zIndex: 20,
    elevation: 8,
  },
  link: { color: "#047857", textAlign: "center", fontWeight: "600", paddingVertical: 8 },
  error: { color: "#b91c1c", fontSize: 14 },
  note: { color: "#64748b", fontSize: 13, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "47%", backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#d1fae5", gap: 6 },
  metricValue: { fontSize: 20, fontWeight: "700", color: "#065f46" },
  metricLabel: { color: "#64748b", fontSize: 13 },
});

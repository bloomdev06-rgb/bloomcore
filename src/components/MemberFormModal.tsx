import React, { useEffect, useState } from "react";
import { MapPin, UserPlus, Wrench } from "lucide-react";
import { Member, Branch, CommunityLevel, PastoralCursus, Department, BloomBusEntity, FormDef } from "../types";
import PhotoCropModal from "./ui/PhotoCropModal";
import { Avatar } from "./ui/Avatar";
import { PhotoLightbox } from "./ui/PhotoLightbox";
import { Modal } from "./ui/Modal";
import { toast } from "./ui/Toast";
import { bloomBusRoleOf, COACH_AND_ABOVE } from "../data/scope";
import { labelFor } from "../data";
import { roleForDeptFn, roleForLevel } from "../../packages/shared/migrate";
import { nearestBusLines } from "../data/geo";
import { normalizePhone } from "../data/phone";

// Fonctions proposées par le menu « Fonction occupée » de la fiche membre : uniquement des
// fonctions DE DÉPARTEMENT. Les fonctions du MODULE Bloom Bus (capitaine, responsable de
// zone, responsable de commune) n'y figurent PAS — elles relèvent d'une autre réalité, se
// gèrent dans le module Bloom Bus et vivent dans `Member.busRole`. Le département Bloom Bus,
// lui, s'affecte ici comme n'importe quel autre : on peut en être adjoint sans être capitaine.
export const DEPT_ROLE_OPTIONS = ["membre", "adjoint", "tresorier", "responsable_section", "responsable"] as const;
export type DeptRoleOption = (typeof DEPT_ROLE_OPTIONS)[number];

// Une fonction stockée hors de cette liste (typiquement une fonction territoriale Bloom Bus
// d'une fiche non encore migrée) ne doit JAMAIS être
// préchargée dans le menu : la valeur resterait en mémoire alors que le menu, n'ayant pas
// l'option correspondante, afficherait autre chose — et c'est la mémoire qui serait
// enregistrée. Le bouton d'affectation annonçait ainsi « comme Responsable de Zone » sans que
// personne ne l'ait choisi. On retombe sur « membre », neutre et présent dans la liste.
export function asDeptRoleOption(fn: unknown): DeptRoleOption {
  return (DEPT_ROLE_OPTIONS as readonly string[]).includes(String(fn))
    ? (fn as DeptRoleOption)
    : "membre";
}

// Vocabulaire du MODULE Bloom Bus — n'a rien à faire dans l'emplacement du département. Une
// fiche d'avant la séparation §27 peut encore en porter (les deux orthographes) tant que la
// migration n'a pas tourné.
const TERRITORIAL_FNS = [
  "capitaine", "responsable_zone", "responsable_commune",
  "Capitaine de Bus", "Responsable de Zone", "Responsable de Commune",
];

// Système ivoirien : primaire → lycée + niveaux du supérieur.
export const SCHOOL_LEVELS = [
  "CP1", "CP2", "CE1", "CE2", "CM1", "CM2",
  "6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale",
  "BTS", "Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2", "Doctorat",
];

interface MemberFormModalProps {
  open: boolean;
  onClose: () => void;
  member: Member | null; // null = création
  onAdd: (member: Member) => void;
  onUpdate: (member: Member) => void;
  existingMembers: Member[];
  departments: Department[];
  busLines: BloomBusEntity[];
  activeBranch: Branch;
  simulatedRole: string;
  forms?: FormDef[];
  // Formulaire ouvert depuis la page Département : le département est fixé et
  // aucune autre affectation ne peut être ajoutée (rattachement automatique).
  lockDepartmentId?: string;
  // Un Responsable peut modifier la fiche d'un membre mais pas ses départements —
  // la section devient alors un résumé en lecture seule.
  canEditDepartments?: boolean;
  // Enregistrement direct par un responsable hiérarchique Bloom Bus (Capitaine/Zone/
  // Commune) : pré-remplit Commune/Zone/Bloom Bus depuis `operator`, et le rattachement
  // département devient "en attente" (dept_bloom_bus, à valider par le responsable de
  // département) au lieu du sélecteur de département normal.
  operator?: Member;
  directBloomBusRegistration?: boolean;
}

export default function MemberFormModal({
  open,
  onClose,
  member,
  onAdd,
  onUpdate,
  existingMembers,
  departments,
  busLines,
  activeBranch,
  simulatedRole,
  forms = [],
  lockDepartmentId,
  canEditDepartments = true,
  operator,
  directBloomBusRegistration = false,
}: MemberFormModalProps) {
  const isEditing = !!member;
  // P1.4 — labels lus en direct depuis le FormDef fd_membre du Constructeur, matchés par id.
  const membreForm = forms.find((f) => f.id === "fd_membre");
  const membreLabel = (fieldId: string, fallback: string) =>
    membreForm?.fields.find((f) => f.id === fieldId)?.label ?? fallback;

  const [avatarUrl, setAvatarUrl] = useState("");
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);
  // Fichier choisi en attente de cadrage — non nul = la modale de cadrage est ouverte.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneParent, setPhoneParent] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [nationality, setNationality] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"H" | "F">("H");
  const [birthDate, setBirthDate] = useState("");
  const [maritalStatus, setMaritalStatus] = useState<
    "Célibataire" | "Marié(e)" | "Divorcé(e)" | "Veuf(ve)"
  >("Célibataire");
  const [profession, setProfession] = useState("");
  const [schoolLevel, setSchoolLevel] = useState("");
  // Niveau demandé seulement pour élève/étudiant — détecté sur la profession saisie (texte libre).
  const isStudent = /élève|eleve|étudiant|etudiant/i.test(profession);
  const [commune, setCommune] = useState("Cocody");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  // Un GPS "manuel" (position réelle, saisie ou membre existant) ne doit jamais être écrasé
  // par le centre approximatif d'une commune/bus sélectionné — cf. audit Phase 0 : le défaut
  // Cocody collait tous les membres sans GPS au même point, faussant toute distance/carte.
  const [gpsIsManual, setGpsIsManual] = useState(false);
  const [memberBranch, setMemberBranch] = useState<Branch>("church");
  const [level, setLevel] = useState<CommunityLevel>("stagiaire");
  const [pastoralCursus, setPastoralCursus] = useState<PastoralCursus>("aucun");
  const [baptismStatus, setBaptismStatus] = useState<"non_baptise" | "baptise">("non_baptise");
  const [baptismDate, setBaptismDate] = useState("");
  const [baptismViaDepartment, setBaptismViaDepartment] = useState(false);
  const [deptName, setDeptName] = useState("dept_louange");
  const [deptRole, setDeptRole] = useState<DeptRoleOption>("membre");
  const [depts, setDepts] = useState<Member["departments"]>({});
  // deptId -> branche : une affectation secondaire hors branche d'attache (Coach+ uniquement,
  // cf. COACH_AND_ABOVE). Absent = affectation dans la branche d'attache (memberBranch).
  const [deptBranches, setDeptBranches] = useState<NonNullable<Member["deptBranches"]>>({});
  const [pendingDeptBranch, setPendingDeptBranch] = useState<Branch>("church");
  const [busZone, setBusZone] = useState("");
  const [selectedBloomBusId, setSelectedBloomBusId] = useState("");

  // Re-hydrate à chaque ouverture — remplace openAddForm()/openEditForm().
  useEffect(() => {
    if (!open) return;
    if (member) {
      setAvatarUrl(member.avatarUrl || "");
      setFirstName(member.firstName);
      setLastName(member.lastName);
      setPhone(member.phone);
      setPhoneParent(member.phoneParent || "");
      setEmergencyContact(member.emergencyContact || "");
      setNationality(member.nationality || "");
      setNeighborhood(member.neighborhood || "");
      setEmail(member.email || "");
      setGender(member.gender);
      setBirthDate(member.birthDate);
      setMaritalStatus(member.maritalStatus);
      setProfession(member.profession);
      setSchoolLevel(member.schoolLevel || "");
      setCommune(member.gps?.commune || "Cocody");
      setLat(member.gps ? member.gps.lat.toString() : "");
      setLng(member.gps ? member.gps.lng.toString() : "");
      setGpsIsManual(!!member.gps);
      setMemberBranch(member.branch);
      setLevel(member.level);
      setPastoralCursus(member.pastoralCursus);
      setBaptismStatus(member.baptismStatus);
      setBaptismDate(member.baptismDate ?? "");
      setBaptismViaDepartment(member.baptismViaDepartment ?? false);
      const firstDept = lockDepartmentId || Object.keys(member.departments)[0] || "dept_louange";
      setDeptName(firstDept);
      setDeptRole(asDeptRoleOption(member.departments[firstDept]));
      // Filet §27 — une fiche non encore migrée peut porter une fonction TERRITORIALE dans
      // l'emplacement du département (avant que la migration au démarrage du serveur ne l'ait
      // déplacée). La charger telle quelle ferait rejeter l'enregistrement par le serveur, qui
      // n'accepte plus ce vocabulaire ici. On l'écarte donc de l'écran : la fonction reste
      // lisible et modifiable dans le module Bloom Bus, seul endroit qui la gère.
      setDepts(Object.fromEntries(
        Object.entries(member.departments).filter(([, fn]) => !TERRITORIAL_FNS.includes(String(fn))),
      ));
      setDeptBranches({ ...(member.deptBranches ?? {}) });
      setPendingDeptBranch(member.branch);
      setBusZone(busLines.find((b) => b.id === member.bloomBusId)?.zone || "");
      setSelectedBloomBusId(member.bloomBusId || "");
    } else {
      setAvatarUrl("");
      setFirstName("");
      setLastName("");
      setPhone("");
      setPhoneParent("");
      setEmail("");
      setGender("H");
      setBirthDate("1998-01-01");
      setMaritalStatus("Célibataire");
      setProfession("");
      setSchoolLevel("");
      setCommune("Cocody");
      setLat("");
      setLng("");
      setGpsIsManual(false);
      setMemberBranch(activeBranch === "global" ? "church" : activeBranch);
      setLevel("stagiaire");
      setPastoralCursus("aucun");
      setBaptismStatus("non_baptise");
      setBaptismDate("");
      setBaptismViaDepartment(false);
      setDeptName(lockDepartmentId || "dept_louange");
      setDeptRole("membre");
      setDepts({});
      setDeptBranches({});
      setPendingDeptBranch(activeBranch === "global" ? "church" : activeBranch);
      setBusZone("");
      setSelectedBloomBusId("");
    }
    // busLines volontairement hors deps : cet effet RÉINITIALISE tout le formulaire, on ne veut
    // le rejouer qu'à l'ouverture/au changement de membre — pas quand bus_lines se resynchronise
    // (ça effacerait les saisies en cours). busLines n'est lu que pour semer busZone au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member, lockDepartmentId, activeBranch]);

  // Enregistrement direct Bloom Bus : pré-remplit Commune/Zone/Bus depuis le bus de
  // l'opérateur selon son palier hiérarchique — reste ajustable ensuite (pas de lock).
  useEffect(() => {
    if (!open || member || !directBloomBusRegistration || !operator) return;
    const bbRole = bloomBusRoleOf(operator, departments);
    const ownBus = busLines.find((b) => b.id === operator.bloomBusId);
    if (!ownBus) return;
    if (bbRole === "Capitaine de Bus") {
      setCommune(ownBus.commune);
      setBusZone(ownBus.zone);
      setSelectedBloomBusId(ownBus.id);
    } else if (bbRole === "Responsable de Zone") {
      setCommune(ownBus.commune);
      setBusZone(ownBus.zone);
    } else if (bbRole === "Responsable de Commune") {
      setCommune(ownBus.commune);
    }
    // Déps volontairement réduites à [open] : ne pré-remplir qu'à l'OUVERTURE. busLines/
    // departments/operator sont des refs recréées à chaque render du parent — les inclure
    // relancerait l'effet et écraserait les ajustements Commune/Zone/Bus saisis par l'utilisateur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Choisir un fichier n'envoie plus directement : on passe d'abord par le cadrage (le
  // recadrage automatique au centre coupait les visages sur les photos en pied ou de groupe).
  const handlePhotoUpload = (file: File | undefined) => {
    if (!file) return;
    setCropFile(file);
  };

  // Sortie du cadrage : les deux tailles sont déjà produites et recadrées, il ne reste qu'à
  // téléverser. Hors-ligne (apiUpload renvoie null) → on garde la vignette en dataURL, exactement
  // comme le faisait downscaleAndUpload : le repli offline-first n'est pas perdu.
  const handleCropped = async (thumb: string, large: string) => {
    setCropFile(null);
    try {
      const { apiUpload } = await import("../data/api");
      setAvatarUrl((await apiUpload(thumb, large)) ?? thumb);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleUseMyPosition = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGpsIsManual(true);
      },
      () => toast.error("Impossible d'obtenir la position GPS de l'appareil."),
    );
  };

  const handleCommuneChange = (val: string) => {
    setCommune(val);
    setBusZone("");
    setSelectedBloomBusId("");
    // Ne pré-remplit que si le GPS n'est pas déjà réel (saisi/géolocalisé/membre existant) —
    // sinon changer de commune écraserait silencieusement la position réelle du membre.
    if (gpsIsManual) return;
    const busLine = busLines.find((line) => line.commune.toLowerCase() === val.toLowerCase());
    if (busLine) {
      setLat(busLine.centerLat.toString());
      setLng(busLine.centerLng.toString());
    }
  };

  const handleBusZoneChange = (val: string) => {
    setBusZone(val);
    setSelectedBloomBusId("");
  };

  const handleBloomBusChange = (val: string) => {
    setSelectedBloomBusId(val);
    if (gpsIsManual) return;
    const bus = busLines.find((b) => b.id === val);
    if (bus) {
      setLat(bus.centerLat.toString());
      setLng(bus.centerLng.toString());
    }
  };

  // Choix depuis la liste "plus proches" (basée sur le GPS réel) : aligne commune/zone sur le
  // bus choisi mais NE touche PAS lat/lng, qui restent la position réelle du membre.
  const selectNearestBus = (bus: BloomBusEntity) => {
    setCommune(bus.commune);
    setBusZone(bus.zone);
    setSelectedBloomBusId(bus.id);
  };

  // Sélection en cascade Commune → Zone → Bloom Bus, dérivée des lignes de bus réelles.
  const busZonesForCommune = Array.from(
    new Set(busLines.filter((b) => b.commune.toLowerCase() === commune.toLowerCase()).map((b) => b.zone)),
  ).sort();
  const busesForZone = busLines.filter(
    (b) => b.commune.toLowerCase() === commune.toLowerCase() && b.zone === busZone,
  );

  // Alternatives par distance réelle — seulement si une vraie position GPS est disponible.
  const parsedLatVal = parseFloat(lat);
  const parsedLngVal = parseFloat(lng);
  const nearbyBuses = gpsIsManual && Number.isFinite(parsedLatVal) && Number.isFinite(parsedLngVal)
    ? nearestBusLines({ lat: parsedLatVal, lng: parsedLngVal }, busLines).slice(0, 3)
    : [];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !phone) {
      toast.error("Veuillez remplir les champs obligatoires (Prénom, Nom, Téléphone).");
      return;
    }

    if (existingMembers.some((m) => normalizePhone(String(m.phone)) === normalizePhone(phone) && m.id !== member?.id)) {
      toast.error("Ce numéro de téléphone est déjà utilisé par un autre membre.");
      return;
    }

    // Pas de repli Cocody : un membre sans position réelle n'a PAS de gps (undefined), plutôt
    // que la même fausse coordonnée pour tout le monde — TerritoryMap/haversine filtrent déjà
    // sur `m.gps` présent, aucun lecteur du champ ne suppose qu'il existe toujours.
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const gpsCoords = Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
      ? { lat: parsedLat, lng: parsedLng, commune }
      : undefined;
    // Instance bloom_bus de la branche du membre : les départements existent en deux
    // exemplaires (un par branche) et prendre le premier de la liste rattachait une partie des
    // membres au département de l'AUTRE branche — invisible à l'écran, mais leur portée Bloom
    // Bus ne se résolvait plus. Repli sur la première instance si aucune n'est scopée.
    const busDepts = departments.filter((d) => d.specialFunction === "bloom_bus");
    const busDeptId = (busDepts.find((d) => d.branch === memberBranch) ?? busDepts[0])?.id;

    const updatedDepartments: Member["departments"] =
      directBloomBusRegistration && busDeptId
        ? { [busDeptId]: "membre" as any }
        : lockDepartmentId
          ? { [lockDepartmentId]: deptRole as any }
          : canEditDepartments === false
            ? (member?.departments ?? {})
            // `depts` (les chips ajoutées) fait foi. Pas de repli sur { [deptName]: deptRole } :
            // ça ré-injectait le département par défaut du sélecteur jamais confirmé et empêchait
            // de vider les affectations d'un membre.
            : depts;

    // Ne garder que les entrées deptBranches dont le département est toujours affecté — les
    // chemins lockDepartmentId/directBloomBusRegistration/readonly ignorent `depts`, il ne faut
    // pas laisser une branche secondaire orpheline pointer vers un département retiré.
    const finalDeptBranches: NonNullable<Member["deptBranches"]> = {};
    for (const dId of Object.keys(deptBranches)) {
      if (dId in updatedDepartments) finalDeptBranches[dId] = deptBranches[dId];
    }

    if (isEditing && member) {
      onUpdate({
        ...member,
        avatarUrl: avatarUrl || undefined,
        firstName,
        lastName,
        phone,
        phoneParent,
        emergencyContact: emergencyContact || undefined,
        nationality: nationality || undefined,
        neighborhood: neighborhood || undefined,
        email,
        gender,
        birthDate,
        maritalStatus,
        profession,
        schoolLevel: isStudent ? schoolLevel || undefined : undefined,
        gps: gpsCoords,
        bloomBusId: selectedBloomBusId || undefined,
        branch: memberBranch,
        level,
        pastoralCursus,
        baptismStatus,
        baptismDate: baptismStatus === "baptise" ? baptismDate || undefined : undefined,
        baptismViaDepartment: baptismStatus === "baptise" ? baptismViaDepartment : undefined,
        departments: updatedDepartments,
        deptBranches: Object.keys(finalDeptBranches).length ? finalDeptBranches : undefined,
        hasPassedToBossForm: true,
      });
    } else {
      onAdd({
        id: `mem_custom_${Date.now()}`,
        avatarUrl: avatarUrl || undefined,
        firstName,
        lastName,
        phone,
        phoneParent,
        emergencyContact: emergencyContact || undefined,
        nationality: nationality || undefined,
        neighborhood: neighborhood || undefined,
        email,
        gender,
        birthDate,
        maritalStatus,
        profession,
        schoolLevel: isStudent ? schoolLevel || undefined : undefined,
        gps: gpsCoords,
        bloomBusId: selectedBloomBusId || undefined,
        branch: memberBranch,
        level,
        pastoralCursus,
        baptismStatus,
        baptismDate: baptismStatus === "baptise" ? baptismDate || undefined : undefined,
        baptismViaDepartment: baptismStatus === "baptise" ? baptismViaDepartment : undefined,
        departments: updatedDepartments,
        deptBranches: Object.keys(finalDeptBranches).length ? finalDeptBranches : undefined,
        deptAttachmentStatus: directBloomBusRegistration ? "pending" : undefined,
        deptAttachmentOrigin: directBloomBusRegistration ? "bloom_bus" : undefined,
        entryDate: new Date().toISOString().split("T")[0],
        hasPassedToBossForm: true,
        healthKPIs: { spirituel: 3, social: 3, financier: 3, physique: 4, presenceCulte: 4, presenceService: 3 },
      });
    }

    onClose();
  };

  if (!open) return null;

  const deptSectionMode = directBloomBusRegistration
    ? "pending"
    : lockDepartmentId ? "locked" : canEditDepartments === false ? "readonly" : "editable";

  // Approximation client de resolveRoles (server/rbac.ts) à partir des seuls champs éditables
  // ici (departments, level, cursus) — admins/ministries n'arrivent pas jusqu'à ce modal. Le
  // serveur reste la source d'autorité (assertCanWrite rejette un deptBranches hors Coach+).
  const draftRoles = new Set<string>(Object.values(depts).map((fn) => roleForDeptFn(fn)));
  if (level === "coach" || level === "leader") draftRoles.add(roleForLevel(level));
  if (["pasteur_titulaire", "pasteur_assistant", "assistant_pasteur"].includes(pastoralCursus)) draftRoles.add("Pasteur");
  const canAssignSecondaryBranch = COACH_AND_ABOVE.some((r) => draftRoles.has(r));

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEditing ? "Modifier la Fiche Physique du Membre" : "Créer une Nouvelle Fiche Membre"}
        icon={<UserPlus size={18} className="text-bc-text" />}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => avatarUrl && setShowPhotoLightbox(true)}
              className={avatarUrl ? "cursor-zoom-in active-scale" : "cursor-default"}
              aria-label="Agrandir la photo"
            >
              <Avatar src={avatarUrl || undefined} initials={`${firstName.charAt(0)}${lastName.charAt(0)}` || "?"} size="lg" />
            </button>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f20', 'Photo du membre')}</label>
              <div className="flex items-center gap-2">
                <label className="px-3 py-1.5 rounded-full border border-bc-border bg-white text-xs font-bold text-bc-text cursor-pointer hover:border-bc-green transition-colors active:scale-95">
                  {avatarUrl ? "Changer la photo" : "Ajouter une photo"}
                  <input
                    id="form-photo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                  />
                </label>
                {avatarUrl && (
                  <button type="button" onClick={() => setAvatarUrl("")} className="text-xs font-bold text-bc-danger active:scale-95">
                    Retirer
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f1', 'Prénom(s)')} *</label>
              <input
                id="form-firstname"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f0', 'Nom de famille')} *</label>
              <input
                id="form-lastname"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
            </div>
          </div>

          {/* Contacts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f2', 'Téléphone unique')} *</label>
              <input
                id="form-phone"
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+225..."
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f3', 'Téléphone Parent/Proche')}</label>
              <input
                id="form-phone-parent"
                type="text"
                value={phoneParent}
                onChange={(e) => setPhoneParent(e.target.value)}
                placeholder="+225..."
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">Contact d'urgence</label>
              <input type="text" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Nom + téléphone" className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green" />
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">Nationalité</label>
              <input type="text" value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="Ex. Ivoirienne" className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green" />
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">Quartier</label>
              <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Ex. Riviera Palmeraie" className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green" />
            </div>
          </div>

          {/* Identity Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f4', 'Genre')} *</label>
              <div className="flex space-x-2">
                <button
                  id="form-gender-h"
                  type="button"
                  onClick={() => setGender("H")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-full border active:scale-95 ${gender === "H" ? "bg-bc-green text-white border-bc-green" : "border-bc-border"}`}
                >
                  Homme
                </button>
                <button
                  id="form-gender-f"
                  type="button"
                  onClick={() => setGender("F")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-full border active:scale-95 ${gender === "F" ? "bg-bc-green text-white border-bc-green" : "border-bc-border"}`}
                >
                  Femme
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f5', 'Date de Naissance')}{!isEditing && ' *'}</label>
              <input
                id="form-birthdate"
                type="date"
                required={!isEditing}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f6', 'État Matrimonial')}</label>
              <select
                id="form-marital-status"
                value={maritalStatus}
                onChange={(e) => setMaritalStatus(e.target.value as any)}
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green bg-white"
              >
                <option value="Célibataire">Célibataire</option>
                <option value="Marié(e)">Marié(e)</option>
                <option value="Divorcé(e)">Divorcé(e)</option>
                <option value="Veuf(ve)">Veuf(ve)</option>
              </select>
            </div>
          </div>

          {/* Profession and email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {/* Email obligatoire à la CRÉATION : c'est le canal du lien d'activation du
                  compte (server issueAuthLink). Sans lui, la fiche est créée mais la personne
                  ne peut jamais activer son compte, et rien ne le signale. Pas exigé en
                  ÉDITION, pour ne pas bloquer la modification des fiches d'avant cette règle. */}
              <label className="block text-xs font-bold text-bc-text mb-1">
                {membreLabel('f7', 'Email')}{!isEditing && ' *'}
              </label>
              <input
                id="form-email"
                type="email"
                required={!isEditing}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
              {!isEditing && (
                <p className="mt-1 text-[10px] text-bc-text-secondary">Reçoit le lien d'activation du compte.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">{membreLabel('f8', 'Profession')}</label>
              <input
                id="form-profession"
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="ex: Web designer, Élève, Étudiant"
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
              />
            </div>
          </div>

          {/* Niveau scolaire — liste canonique (pas de texte libre) pour que les listes par niveau (3ème, Terminale…) restent filtrables */}
          {isStudent && (
            <div>
              <label className="block text-xs font-bold text-bc-text mb-1">Niveau (classe / niveau d'études)</label>
              <select
                id="form-school-level"
                value={schoolLevel}
                onChange={(e) => setSchoolLevel(e.target.value)}
                className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green bg-white"
              >
                <option value="">— Sélectionner —</option>
                {SCHOOL_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          )}

          {/* Territory & GPS Coordinates */}
          <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text-secondary flex items-center gap-1">
                <MapPin size={12} /> Situation Géographique
              </span>
              <button
                type="button"
                onClick={handleUseMyPosition}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-bc-green text-white text-[10px] font-bold active:scale-95 transition-transform"
              >
                <MapPin size={11} /> Utiliser ma position
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f9', 'Commune')}</label>
                <select
                  id="form-commune"
                  value={commune}
                  onChange={(e) => handleCommuneChange(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                >
                  <option value="Cocody">Cocody</option>
                  <option value="Yopougon">Yopougon</option>
                  <option value="Abobo">Abobo</option>
                  <option value="Koumassi">Koumassi</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f10', 'Latitude')}</label>
                <input
                  id="form-lat"
                  type="text"
                  value={lat}
                  onChange={(e) => { setLat(e.target.value); setGpsIsManual(true); }}
                  className="w-full border border-bc-border rounded-full px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f11', 'Longitude')}</label>
                <input
                  id="form-lng"
                  type="text"
                  value={lng}
                  onChange={(e) => { setLng(e.target.value); setGpsIsManual(true); }}
                  className="w-full border border-bc-border rounded-full px-2 py-1 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">Zone Bloom Bus</label>
                <select
                  id="form-bus-zone"
                  value={busZone}
                  onChange={(e) => handleBusZoneChange(e.target.value)}
                  className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">— Sélectionner —</option>
                  {busZonesForCommune.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">Bloom Bus</label>
                <select
                  id="form-bloom-bus"
                  value={selectedBloomBusId}
                  onChange={(e) => handleBloomBusChange(e.target.value)}
                  disabled={!busZone}
                  className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white disabled:opacity-50"
                >
                  <option value="">— Sélectionner —</option>
                  {busesForZone.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {nearbyBuses.length > 0 && (
              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                  Bus les plus proches (position réelle)
                </label>
                <div className="flex flex-col gap-1">
                  {nearbyBuses.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => selectNearestBus(b)}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        selectedBloomBusId === b.id
                          ? "bg-bc-green text-white border-bc-green"
                          : "bg-white text-bc-text border-bc-border hover:bg-bc-canvas"
                      }`}
                    >
                      <span className="font-bold">{b.name} · {b.commune}</span>
                      <span className={selectedBloomBusId === b.id ? "text-white/80" : "text-bc-text-secondary"}>
                        {b.distanceKm.toFixed(1)} km
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Axis 1 & 2 & 3 Selection */}
          <div className="p-4 border border-bc-border rounded-[2rem] space-y-3 bg-bc-green/5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text flex items-center gap-1">
              <Wrench size={12} className="text-bc-text-secondary" /> Grades
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">1. {membreLabel('f12', 'Niveau Communautaire')}</label>
                <select
                  id="form-community-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as any)}
                  className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                >
                  <option value="stagiaire">Stagiaire</option>
                  <option value="boss">Boss</option>
                  <option value="leader">Leader</option>
                  <option value="coach">Coach</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">2. {membreLabel('f13', 'Cursus Pastoral')}</label>
                <select
                  id="form-pastoral-cursus"
                  value={pastoralCursus}
                  onChange={(e) => setPastoralCursus(e.target.value as any)}
                  className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                >
                  <option value="aucun">Aucun</option>
                  <option value="appele">Appelé</option>
                  <option value="serviteur">Serviteur</option>
                  <option value="gagneur_ame">Gagneur d'âme</option>
                  <option value="assistant_pasteur">Assistant Pasteur</option>
                  <option value="pasteur_assistant">Pasteur Assistant</option>
                  <option value="pasteur_titulaire">Pasteur Titulaire</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f14', "Branche d'affectation")}</label>
                {/* D4 — transfert de branche : sur un membre EXISTANT, réservé au périmètre
                    global (Pasteur/Admin/Super Admin). Un Responsable ne transfère pas. */}
                <select
                  id="form-branch"
                  value={memberBranch}
                  onChange={(e) => setMemberBranch(e.target.value as any)}
                  disabled={isEditing && !['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'].includes(simulatedRole)}
                  className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="church">Bloom Church</option>
                  <option value="light">Bloom Light</option>
                </select>
                {isEditing && !['Super Admin', 'Admin', 'Pasteur Principal', 'Pasteur'].includes(simulatedRole) && (
                  <p className="text-[9px] text-bc-text-secondary mt-1 italic">Transfert de branche réservé à la ligne pastorale.</p>
                )}
              </div>
            </div>
          </div>

          {/* Department Function */}
          <div className="p-4 border border-bc-border rounded-[2rem] bg-bc-green/5 space-y-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text">
              3. Affectation Départementale & Fonctions
            </span>

            {deptSectionMode === "pending" ? (
              <p className="text-[9px] text-bc-text-secondary italic">
                Enregistrement direct Bloom Bus : le rattachement au département sera <strong>en attente</strong> jusqu'à validation par le responsable de département concerné.
              </p>
            ) : deptSectionMode === "readonly" ? (
              <>
                <p className="text-[9px] text-bc-text-secondary italic">Le rattachement départemental est réservé à la ligne pastorale.</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(member?.departments ?? {}).map(([dId, fn]) => (
                    <span key={dId} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-bc-green/10 text-xs text-bc-text">
                      {departments.find((d) => d.id === dId)?.name ?? dId} · {fn}
                    </span>
                  ))}
                </div>
              </>
            ) : deptSectionMode === "locked" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f15', 'Département')}</label>
                  <div className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs bg-bc-canvas/60 text-bc-text-secondary">
                    {departments.find((d) => d.id === lockDepartmentId)?.name ?? lockDepartmentId}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f16', 'Fonction occupée')}</label>
                  <select
                    id="form-dept-role"
                    value={deptRole}
                    onChange={(e) => setDeptRole(asDeptRoleOption(e.target.value))}
                    className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                  >
                    {DEPT_ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{labelFor(r)}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f15', 'Département')}</label>
                    <select
                      id="form-dept-name"
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                      className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f16', 'Fonction occupée')}</label>
                    <select
                      id="form-dept-role"
                      value={deptRole}
                      onChange={(e) => setDeptRole(asDeptRoleOption(e.target.value))}
                      className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      {DEPT_ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{labelFor(r)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {canAssignSecondaryBranch && (
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      Branche de cette affectation
                    </label>
                    <select
                      id="form-dept-branch"
                      value={pendingDeptBranch}
                      onChange={(e) => setPendingDeptBranch(e.target.value as Branch)}
                      className="w-full sm:w-auto border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="church">Church</option>
                      <option value="light">Light</option>
                    </select>
                    <p className="text-[9px] text-bc-text-secondary mt-1 italic">
                      Réservé Coach et plus : laisse cette affectation dans la branche d'attache ({memberBranch === "church" ? "Church" : "Light"}) sauf si tu choisis l'autre branche ici.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDepts((prev) => ({ ...prev, [deptName]: deptRole }));
                    setDeptBranches((prev) => {
                      const next = { ...prev };
                      if (canAssignSecondaryBranch && pendingDeptBranch !== memberBranch) next[deptName] = pendingDeptBranch;
                      else delete next[deptName];
                      return next;
                    });
                  }}
                  className="text-xs font-bold text-bc-green hover:underline active:scale-95"
                >
                  {/* Le libellé nomme le département ET la fonction. Avant, il disait « Ajouter
                      cette affectation » : un opérateur qui ne changeait que la Fonction, en
                      croyant promouvoir dans le département affiché plus haut, promouvait en
                      réalité dans celui du sélecteur — resté sur sa valeur par défaut. C'est
                      l'origine du cas « promu responsable de Bloom Praise au lieu de Bloom Bus ». */}
                  + Affecter à {departments.find((d) => d.id === deptName)?.name ?? deptName} comme {labelFor(deptRole)}
                </button>
                {Object.keys(depts).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(depts).map(([dId, fn]) => (
                      <span key={dId} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-bc-green/10 text-xs text-bc-text">
                        {departments.find((d) => d.id === dId)?.name ?? dId} · {labelFor(fn)}
                        {deptBranches[dId] && ` · ${deptBranches[dId] === "church" ? "Church" : "Light"}`}
                        <button
                          type="button"
                          aria-label={`Retirer ${dId}`}
                          onClick={() => {
                            setDepts((prev) => {
                              const next = { ...prev };
                              delete next[dId];
                              return next;
                            });
                            setDeptBranches((prev) => {
                              const next = { ...prev };
                              delete next[dId];
                              return next;
                            });
                          }}
                          className="text-bc-text-secondary hover:text-bc-danger active:scale-95"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Baptême — statut + date + via département / hors process */}
          <div className="border-t border-bc-border pt-4">
            <label className="block text-[10px] font-bold text-bc-text-secondary mb-2">{membreLabel('f17', 'Baptême')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={baptismStatus}
                onChange={(e) => setBaptismStatus(e.target.value as "non_baptise" | "baptise")}
                className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white"
              >
                <option value="non_baptise">Non baptisé</option>
                <option value="baptise">Baptisé</option>
              </select>
              {baptismStatus === "baptise" && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f18', 'Date de baptême')}</label>
                    <input
                      type="date"
                      value={baptismDate}
                      onChange={(e) => setBaptismDate(e.target.value)}
                      className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">{membreLabel('f19', 'Voie de baptême')}</label>
                    <select
                      value={baptismViaDepartment ? "dep" : "hors"}
                      onChange={(e) => setBaptismViaDepartment(e.target.value === "dep")}
                      className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white"
                    >
                      <option value="dep">Via dép. Baptême</option>
                      <option value="hors">Hors process</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-bc-border">
            <button
              id="form-cancel-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas active:scale-95"
            >
              Annuler
            </button>
            <button
              id="form-submit-btn"
              type="submit"
              className="px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 active:scale-95 bg-bc-green"
            >
              Sauvegarder la Fiche
            </button>
          </div>
        </form>
      </Modal>

      {showPhotoLightbox && avatarUrl && (
        <PhotoLightbox src={avatarUrl} alt={`${firstName} ${lastName}`} onClose={() => setShowPhotoLightbox(false)} />
      )}

      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropped}
        />
      )}
    </>
  );
}

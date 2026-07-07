import React, { useState } from "react";
import {
  Search,
  Filter,
  Plus,
  MapPin,
  Phone,
  Mail,
  Calendar,
  ChevronRight,
  Edit,
  UserPlus,
  CheckCircle,
  X,
  Compass,
  LayoutGrid,
  List,
  Wrench,
  Download,
  GraduationCap
} from "lucide-react";
import { motion } from "motion/react";
import { Member, Branch, CommunityLevel, PastoralCursus, Report, AuditLog, PermissionMatrix } from "../types";
import { useDepartments, useBusLines, useMinistries } from "../data";
import { downscaleImage } from "../lib/image";
import { isRed } from "../data/kpi";
import { inMemberScope } from "../data/scope";
import Member360View from "./Member360View";
import { Avatar } from "./ui/Avatar";
import { staggerParent, staggerItem } from "./ui/motion";

// Échelle de niveau communautaire teintée charte (au lieu de gris plat) : chaque
// palier a sa couleur — Coach violet, Leader fushia, Boss céruléen, Stagiaire neutre.
const LEVEL_STYLE: Record<string, string> = {
  Coach: "bg-bc-purple/10 text-bc-purple",
  Leader: "bg-bc-fushia/10 text-bc-fushia",
  Boss: "bg-bc-cerulean/10 text-bc-cerulean",
  Stagiaire: "bg-bc-canvas text-bc-text-secondary",
};
const levelStyle = (l: string) => LEVEL_STYLE[l] ?? "bg-bc-canvas text-bc-text-secondary";

function downloadCsv(filename: string, rows: string[][]) {
  const cell = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface MembersViewProps {
  members: Member[];
  onUpdateMember: (member: Member) => void;
  onAddMember: (member: Member) => void;
  reports?: Report[];
  onAddReport?: (r: Report) => void;
  activeBranch: Branch;
  simulatedRole: string;
  operator?: Member;
  audits?: AuditLog[];
  permissionMatrix: PermissionMatrix;
}

export default function MembersView({
  members,
  onUpdateMember,
  onAddMember,
  reports = [],
  onAddReport,
  activeBranch,
  simulatedRole,
  operator,
  audits = [],
  permissionMatrix,
}: MembersViewProps) {
  const INITIAL_DEPARTMENTS = useDepartments();
  const INITIAL_BUS_LINES = useBusLines();
  const ministries = useMinistries();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel, setFilterLevel] = useState<CommunityLevel | "all">("all");
  const [filterPastoralCursus, setFilterPastoralCursus] = useState<PastoralCursus | "all">("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterFunction, setFilterFunction] = useState<string>("all");
  const [filterBaptism, setFilterBaptism] = useState<string>("all");
  const [filterRed, setFilterRed] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showMember360, setShowMember360] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form Fields State
  const [avatarUrl, setAvatarUrl] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneParent, setPhoneParent] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"H" | "F">("H");
  const [birthDate, setBirthDate] = useState("");
  const [maritalStatus, setMaritalStatus] = useState<
    "Célibataire" | "Marié(e)" | "Divorcé(e)" | "Veuf(ve)"
  >("Célibataire");
  const [profession, setProfession] = useState("");
  const [commune, setCommune] = useState("Cocody");
  const [lat, setLat] = useState("5.3854");
  const [lng, setLng] = useState("-3.9781");
  const [memberBranch, setMemberBranch] = useState<Branch>("church");
  const [level, setLevel] = useState<CommunityLevel>("Stagiaire");
  const [pastoralCursus, setPastoralCursus] = useState<PastoralCursus>("Aucun");
  const [baptismStatus, setBaptismStatus] = useState<"Non baptisé" | "Baptisé">(
    "Non baptisé",
  );
  const [baptismDate, setBaptismDate] = useState("");
  const [baptismViaDepartment, setBaptismViaDepartment] = useState(false);
  const [deptName, setDeptName] = useState("dept_louange");
  const [deptRole, setDeptRole] = useState<
    "Responsable" | "Adjoint" | "Membre" | "Capitaine de Bus"
  >("Membre");
  // FORMULAIRES §2 — multi-sélection de départements (deptName/deptRole = picker courant)
  const [depts, setDepts] = useState<Member["departments"]>({});

  const isChurch = activeBranch === "church";

  // Potential duplicates by phone (the spec's "dédoublonnage" signal).
  const seenPhones = new Set<string>();
  const dupPhones = new Set<string>();
  members.forEach((m) => {
    if (seenPhones.has(m.phone)) dupPhones.add(m.phone);
    else seenPhones.add(m.phone);
  });

  // Filter logic
  const filteredMembers = members
    .filter((m) => {
      // Exclude 'Nouveau' state from members view if they haven't graduated to a member level yet
      if (m.level === "Nouveau" && m.integrationState !== "Intégré")
        return false;

      const matchesSearch =
        `${m.firstName} ${m.lastName}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        m.phone.includes(searchTerm) ||
        (m.email && m.email.toLowerCase().includes(searchTerm.toLowerCase()));

      // La branche est pilotée par le commutateur global Church/Light/Global du Header.
      const matchesBranch = activeBranch === "global" || m.branch === activeBranch;
      const matchesLevel = filterLevel === "all" || m.level === filterLevel;
      const matchesPastoralCursus = filterPastoralCursus === "all" || m.pastoralCursus === filterPastoralCursus;

      const matchesDept =
        filterDept === "all" || Object.keys(m.departments).includes(filterDept);
      const matchesFunction =
        filterFunction === "all" || Object.values(m.departments).includes(filterFunction as any);
      const matchesBaptism =
        filterBaptism === "all" || m.baptismStatus === filterBaptism;
      const matchesRed = !filterRed || isRed(m);
      const matchesScope = !operator || inMemberScope(operator, m, simulatedRole, INITIAL_BUS_LINES, INITIAL_DEPARTMENTS, ministries);

      return matchesSearch && matchesBranch && matchesLevel && matchesPastoralCursus && matchesDept && matchesFunction && matchesBaptism && matchesRed && matchesScope;
    })
    .sort((a, b) => {
      // Sort alphabetically by last name, then first name
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const menCount = filteredMembers.filter((m) => m.gender === "H").length;
  const womenCount = filteredMembers.filter((m) => m.gender === "F").length;

  const open360View = (member: Member) => {
    setSelectedMember(member);
    setShowMember360(true);
  };

  // Photo membre → dataURL redimensionné (~200px) pour ne pas exploser le quota localStorage.
  const handlePhotoUpload = (file: File | undefined) => {
    if (!file) return;
    downscaleImage(file).then(setAvatarUrl).catch((e) => alert(e.message));
  };

  // Maillage GPS automatique via le GPS de l'appareil (même pattern que la fiche ADN).
  const handleUseMyPosition = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => alert("Impossible d'obtenir la position GPS de l'appareil."),
    );
  };

  const openAddForm = () => {
    setIsEditing(false);
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
    setCommune("Cocody");
    setLat("5.3854");
    setLng("-3.9781");
    setMemberBranch(activeBranch);
    setLevel("Stagiaire");
    setPastoralCursus("Aucun");
    setBaptismStatus("Non baptisé");
    setBaptismDate("");
    setBaptismViaDepartment(false);
    setDeptName("dept_louange");
    setDeptRole("Membre");
    setDepts({});
    setShowFormModal(true);
  };

  const openEditForm = (member: Member) => {
    setIsEditing(true);
    setSelectedMember(member);
    setAvatarUrl(member.avatarUrl || "");
    setFirstName(member.firstName);
    setLastName(member.lastName);
    setPhone(member.phone);
    setPhoneParent(member.phoneParent || "");
    setEmail(member.email || "");
    setGender(member.gender);
    setBirthDate(member.birthDate);
    setMaritalStatus(member.maritalStatus);
    setProfession(member.profession);
    setCommune(member.gps?.commune || "Cocody");
    setLat(member.gps?.lat.toString() || "5.3854");
    setLng(member.gps?.lng.toString() || "-3.9781");
    setMemberBranch(member.branch);
    setLevel(member.level);
    setPastoralCursus(member.pastoralCursus);
    setBaptismStatus(member.baptismStatus);
    setBaptismDate(member.baptismDate ?? "");
    setBaptismViaDepartment(member.baptismViaDepartment ?? false);

    // Get first department key as default
    const firstDept = Object.keys(member.departments)[0] || "dept_louange";
    setDeptName(firstDept);
    setDeptRole((member.departments[firstDept] as any) || "Membre");
    setDepts({ ...member.departments });

    setShowFormModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !phone) {
      alert(
        "Veuillez remplir les champs obligatoires (Prénom, Nom, Téléphone).",
      );
      return;
    }

    if (members.some((m) => m.phone === phone && m.id !== selectedMember?.id)) {
      alert("Ce numéro de téléphone est déjà utilisé par un autre membre.");
      return;
    }

    const gpsCoords = {
      lat: parseFloat(lat) || 5.3854,
      lng: parseFloat(lng) || -3.9781,
      commune,
    };

    // Multi-départements ; si l'utilisateur n'a rien ajouté, le picker courant fait foi
    const updatedDepartments: Member["departments"] =
      Object.keys(depts).length > 0 ? depts : { [deptName]: deptRole as any };

    if (isEditing && selectedMember) {
      const updated: Member = {
        ...selectedMember,
        avatarUrl: avatarUrl || undefined,
        firstName,
        lastName,
        phone,
        phoneParent,
        email,
        gender,
        birthDate,
        maritalStatus,
        profession,
        gps: gpsCoords,
        branch: memberBranch,
        level,
        pastoralCursus,
        baptismStatus,
        baptismDate: baptismStatus === "Baptisé" ? baptismDate || undefined : undefined,
        baptismViaDepartment: baptismStatus === "Baptisé" ? baptismViaDepartment : undefined,
        departments: updatedDepartments,
        hasPassedToBossForm: true,
      };
      onUpdateMember(updated);
    } else {
      const newMember: Member = {
        id: `mem_custom_${Date.now()}`,
        avatarUrl: avatarUrl || undefined,
        firstName,
        lastName,
        phone,
        phoneParent,
        email,
        gender,
        birthDate,
        maritalStatus,
        profession,
        gps: gpsCoords,
        branch: memberBranch,
        level,
        pastoralCursus,
        baptismStatus,
        baptismDate: baptismStatus === "Baptisé" ? baptismDate || undefined : undefined,
        baptismViaDepartment: baptismStatus === "Baptisé" ? baptismViaDepartment : undefined,
        departments: updatedDepartments,
        entryDate: new Date().toISOString().split("T")[0],
        hasPassedToBossForm: true,
        healthKPIs: {
          spirituel: 3,
          social: 3,
          financier: 3,
          physique: 4,
          presenceCulte: 4,
          presenceService: 3,
        },
      };
      onAddMember(newMember);
    }

    setShowFormModal(false);
  };

  // Helper to trigger GPS autofill on commune select
  const handleCommuneChange = (val: string) => {
    setCommune(val);
    const busLine = INITIAL_BUS_LINES.find(
      (line) => line.commune.toLowerCase() === val.toLowerCase(),
    );
    if (busLine) {
      setLat(busLine.centerLat.toString());
      setLng(busLine.centerLng.toString());
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header Banner */}
      <div className="bg-white p-5 rounded-[2rem] border border-bc-border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-bc-text-secondary"
              size={16}
            />
            <input
              id="member-search-input"
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full border border-bc-border rounded-full text-xs bg-bc-canvas/40 focus:outline-none focus:border-bc-green focus:bg-white transition-all"
            />
          </div>

          {/* Level filter */}
          <select
            id="member-filter-level"
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as any)}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-green"
          >
            <option value="all">Tous les Niveaux</option>
            <option value="Stagiaire">Stagiaire</option>
            <option value="Boss">Boss</option>
            <option value="Leader">Leader</option>
            <option value="Coach">Coach</option>
          </select>

          {/* Pastoral Cursus filter */}
          <select
            id="member-filter-pastoral-cursus"
            value={filterPastoralCursus}
            onChange={(e) => setFilterPastoralCursus(e.target.value as any)}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-green"
          >
            <option value="all">Tous les Cursus</option>
            <option value="Aucun">Aucun</option>
            <option value="Appelé">Appelé</option>
            <option value="Serviteur">Serviteur</option>
            <option value="Gagneur d'âme">Gagneur d'âme</option>
            <option value="Assistant Pasteur">Assistant Pasteur</option>
            <option value="Pasteur Assistant">Pasteur Assistant</option>
            <option value="Pasteur Titulaire">Pasteur Titulaire</option>
          </select>

          {/* Department filter */}
          <select
            id="member-filter-dept"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-green"
          >
            <option value="all">Tous les Départements</option>
            {INITIAL_DEPARTMENTS.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>

          {/* Function filter */}
          <select
            id="member-filter-function"
            value={filterFunction}
            onChange={(e) => setFilterFunction(e.target.value)}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-green"
          >
            <option value="all">Toutes les fonctions</option>
            <option value="Responsable">Responsable</option>
            <option value="Adjoint">Adjoint</option>
            <option value="Trésorier">Trésorier</option>
            <option value="Responsable de section">Responsable de section</option>
            <option value="Membre">Membre</option>
            <option value="Capitaine de Bus">Capitaine de Bus</option>
            <option value="Responsable de Zone">Responsable de Zone</option>
            <option value="Responsable de Commune">Responsable de Commune</option>
          </select>

          {/* Baptism filter */}
          <select
            id="member-filter-baptism"
            value={filterBaptism}
            onChange={(e) => setFilterBaptism(e.target.value)}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-green"
          >
            <option value="all">Tout statut baptême</option>
            <option value="Baptisé">Baptisé</option>
            <option value="Non baptisé">Non baptisé</option>
          </select>

          {/* Au rouge toggle */}
          <button
            id="member-filter-red"
            onClick={() => setFilterRed((v) => !v)}
            className={`rounded-full text-xs py-2 px-3 font-bold border transition-colors active:scale-95 ${
              filterRed
                ? "bg-bc-danger text-white border-bc-danger"
                : "bg-white text-bc-danger border-bc-border hover:border-bc-danger/40"
            }`}
          >
            ● Au rouge
          </button>
        </div>

        {/* Action Button & View Toggle */}
        <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
          <div className="flex bg-bc-canvas p-1 rounded-full shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-full transition-colors active:scale-95 ${viewMode === "grid" ? "bg-white shadow-sm text-bc-text" : "text-bc-text-secondary hover:text-bc-text"}`}
              title="Vue en grille"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-full transition-colors active:scale-95 ${viewMode === "list" ? "bg-white shadow-sm text-bc-text" : "text-bc-text-secondary hover:text-bc-text"}`}
              title="Vue en liste"
            >
              <List size={16} />
            </button>
          </div>

          <button
            id="member-export-btn"
            onClick={() =>
              downloadCsv(
                `membres-${new Date().toISOString().split("T")[0]}.csv`,
                [
                  ["nom", "prenom", "telephone", "email", "branche", "niveau", "cursus", "bapteme", "integration"],
                  ...filteredMembers.map((m) => [
                    m.lastName, m.firstName, m.phone, m.email ?? "", m.branch, m.level,
                    m.pastoralCursus, m.baptismStatus, m.integrationState ?? "",
                  ]),
                ],
              )
            }
            className="px-4 py-2.5 rounded-full font-ui font-bold text-xs text-bc-text border border-bc-border bg-white hover:bg-bc-canvas flex items-center gap-1.5 min-h-[48px] active:scale-95"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Export</span>
          </button>

          {["Pasteur", "Admin", "Responsable", "Super Admin"].includes(
            simulatedRole,
          ) && (
            <button
              id="member-add-new-btn"
              onClick={openAddForm}
              className={`w-full md:w-auto px-4 py-2.5 rounded-full font-ui font-bold text-xs text-white shadow-sm flex items-center justify-center space-x-1.5 transition-transform md:hover:scale-105 active:scale-95 cursor-pointer min-h-[48px] ${"bg-bc-green"}`}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Formulaire Membre</span>
              <span className="sm:hidden">Nouveau</span>
            </button>
          )}
        </div>
      </div>

      {/* Members Summary */}
      <div className="flex justify-between items-center px-4">
        <div className="flex items-center gap-4 text-xs font-medium text-bc-text-secondary bg-white px-4 py-2 rounded-full border border-bc-border shadow-sm">
          <span className="font-bold text-bc-text-secondary">Total affiché : {filteredMembers.length}</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bc-cerulean"></span>
            Hommes : {menCount}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bc-fushia"></span>
            Femmes : {womenCount}
          </div>
          {/* Barre de proportion H/F — lecture d'un coup d'œil (rigueur widget) */}
          {(menCount + womenCount) > 0 && (
            <span className="hidden sm:flex h-1.5 w-24 rounded-full overflow-hidden bg-bc-canvas" title={`${menCount} H / ${womenCount} F`}>
              <span className="bg-bc-cerulean transition-all duration-500 ease-out-spring" style={{ width: `${(menCount / (menCount + womenCount)) * 100}%` }} />
              <span className="bg-bc-fushia transition-all duration-500 ease-out-spring" style={{ width: `${(womenCount / (menCount + womenCount)) * 100}%` }} />
            </span>
          )}
        </div>
        {dupPhones.size > 0 && (
          <span className="text-[11px] font-bold text-bc-warning bg-bc-warning/10 border border-bc-warning/20 px-3 py-1.5 rounded-full">
            ⚠ {dupPhones.size} doublon(s) potentiel(s) (même téléphone)
          </span>
        )}
      </div>

      {/* Grid or List of Members */}
      {viewMode === "grid" ? (
        <motion.div
          variants={staggerParent}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {filteredMembers.length === 0 ? (
            <div className="bg-white border border-bc-border shadow-sm p-12 text-center rounded-[2rem] sm:col-span-2 lg:col-span-3 xl:col-span-4 text-bc-text-secondary">
              <p className="text-sm">
                Aucun membre ne correspond à vos filtres.
              </p>
            </div>
          ) : (
            filteredMembers.map((member) => (
              <motion.div
                key={member.id}
                variants={staggerItem}
                onClick={() => open360View(member)}
                className={`bg-white shadow-sm rounded-2xl p-4 hover:shadow-md transition-shadow active:scale-95 flex flex-col justify-between cursor-pointer group border ${
                  isRed(member) ? "border-bc-danger/40 ring-1 ring-bc-danger/20" : "border-bc-border"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3 min-w-0">
                      <Avatar
                        src={member.avatarUrl}
                        initials={`${member.firstName[0]}${member.lastName[0]}`}
                        size="sm"
                        className={`font-black border-2 text-[10px] ${
                          member.branch === "church"
                            ? "bg-bc-green/10 text-bc-text border-bc-cerulean/30"
                            : "bg-bc-green/10 text-bc-text border-bc-orange/30"
                        }`}
                      />
                      <div className="min-w-0">
                        <h3 className="font-ui font-bold text-bc-text text-sm truncate pr-2 leading-tight">
                          {member.firstName} {member.lastName}
                        </h3>
                        <p className="text-[9px] text-bc-text-secondary font-bold uppercase tracking-wider truncate mt-0.5">
                          {member.profession || "Non renseignée"}
                        </p>
                      </div>
                    </div>

                    {/* Edit action */}
                    {[
                      "Pasteur",
                      "Admin",
                      "Responsable",
                      "Super Admin",
                    ].includes(simulatedRole) && (
                      <button
                        id={`edit-member-btn-${member.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditForm(member);
                        }}
                        className="p-3 shrink-0 rounded-xl text-bc-text-secondary hover:text-bc-text hover:bg-bc-canvas transition-colors active:scale-95 opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center justify-center min-w-[48px] min-h-[48px]"
                        title="Modifier la fiche"
                      >
                        <Edit size={12} />
                      </button>
                    )}
                  </div>

                  {/* Info contact (Inline) */}
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-bc-text-secondary font-medium">
                    <div className="flex items-center space-x-1">
                      <Phone size={10} />
                      <span>{member.phone}</span>
                    </div>
                    <span className="text-bc-text-secondary">•</span>
                    <div className="flex items-center space-x-1 truncate">
                      <MapPin size={10} />
                      <span className="truncate">
                        {member.gps?.commune || "Abidjan"}
                      </span>
                    </div>
                  </div>

                  {/* Primary Axes Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${levelStyle(member.level)}`}>
                      <GraduationCap size={9} /> {member.level}
                    </span>

                    {member.pastoralCursus !== "Aucun" && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-bc-warning/10 text-bc-warning border border-bc-warning/20">
                        ⛪ {member.pastoralCursus}
                      </span>
                    )}
                  </div>
                </div>

                {/* Department Roles Subpanel */}
                <div className="mt-3 pt-2 border-t border-bc-border flex justify-between items-center text-[9px]">
                  <div className="text-bc-text-secondary font-medium truncate flex-1 pr-2">
                    {Object.keys(member.departments).length > 0 ? (
                      Object.entries(member.departments).map(
                        ([id, role], index) => {
                          const dName =
                            INITIAL_DEPARTMENTS.find((d) => d.id === id)
                              ?.name || id;
                          return (
                            <span key={id} className="text-bc-text-secondary font-bold">
                              {dName}
                              {index <
                              Object.keys(member.departments).length - 1
                                ? ", "
                                : ""}
                            </span>
                          );
                        },
                      )
                    ) : (
                      <span className="italic text-bc-text-secondary">
                        Aucun département
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-black uppercase tracking-wider shrink-0 text-bc-text`}
                  >
                    {member.branch === "church" ? "Church" : "Light"}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      ) : (
        <div className="bg-white border border-bc-border shadow-sm rounded-2xl overflow-hidden">
          {filteredMembers.length === 0 ? (
            <div className="p-12 text-center text-bc-text-secondary">
              <p className="text-sm">
                Aucun membre ne correspond à vos filtres.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-bc-canvas text-bc-text-secondary font-bold uppercase tracking-wider text-[10px] border-b border-bc-border">
                  <tr>
                    <th className="px-4 py-3">Membre</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Niveau & Cursus</th>
                    <th className="px-4 py-3">Départements</th>
                    <th className="px-4 py-3">Branche</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bc-border">
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className={`hover:bg-bc-canvas transition-colors group cursor-pointer ${
                        isRed(member) ? "bg-bc-danger/5" : ""
                      }`}
                      onClick={() => open360View(member)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          {isRed(member) && (
                            <span className="w-2 h-2 rounded-full bg-bc-danger shrink-0" title="Au rouge" />
                          )}
                          <Avatar
                            src={member.avatarUrl}
                            initials={`${member.firstName[0]}${member.lastName[0]}`}
                            size="sm"
                            className={`w-8 h-8 font-black border-2 text-[9px] ${
                              member.branch === "church"
                                ? "bg-bc-green/10 text-bc-text border-bc-cerulean/30"
                                : "bg-bc-green/10 text-bc-text border-bc-orange/30"
                            }`}
                          />
                          <div>
                            <div className="font-bold text-bc-text">
                              {member.firstName} {member.lastName}
                            </div>
                            <div className="text-[9px] text-bc-text-secondary uppercase font-bold tracking-wider">
                              {member.profession || "Non renseignée"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-bc-text-secondary">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Phone size={10} /> {member.phone}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-bc-text-secondary">
                            <MapPin size={10} />{" "}
                            {member.gps?.commune || "Abidjan"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${levelStyle(member.level)}`}>
                            <GraduationCap size={9} /> {member.level}
                          </span>
                          {member.pastoralCursus !== "Aucun" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-bc-warning/10 text-bc-warning border border-bc-warning/20">
                              ⛪ {member.pastoralCursus}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col text-[10px]">
                          {Object.keys(member.departments).length > 0 ? (
                            Object.entries(member.departments).map(
                              ([id, role], index) => {
                                const dName =
                                  INITIAL_DEPARTMENTS.find((d) => d.id === id)
                                    ?.name || id;
                                return (
                                  <span
                                    key={id}
                                    className="text-bc-text-secondary font-bold truncate max-w-[150px]"
                                  >
                                    {dName}
                                  </span>
                                );
                              },
                            )
                          ) : (
                            <span className="italic text-bc-text-secondary">Aucun</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-black uppercase text-[10px] tracking-wider text-bc-text">
                          {member.branch === "church" ? "Church" : "Light"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {[
                          "Pasteur",
                          "Admin",
                          "Responsable",
                          "Super Admin",
                        ].includes(simulatedRole) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditForm(member);
                            }}
                            className="p-1.5 rounded-xl text-bc-text-secondary hover:text-bc-text hover:bg-bc-canvas transition-colors active:scale-95 opacity-0 group-hover:opacity-100 inline-flex"
                            title="Modifier la fiche"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Member 360 View Modal */}
      {showMember360 && selectedMember && (
        <Member360View
          member={selectedMember}
          onClose={() => setShowMember360(false)}
          simulatedRole={simulatedRole}
          reports={reports}
          audits={audits}
          onAddReport={onAddReport}
          onUpdate={(m) => { onUpdateMember(m); setSelectedMember(m); }}
          onEdit={(m) => {
            setShowMember360(false);
            openEditForm(m);
          }}
          operator={operator}
          permissionMatrix={permissionMatrix}
        />
      )}

      {/* Member Form Modal (Fiche Complète) */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] max-w-2xl w-full p-6 border border-bc-border shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              id="close-form-modal-btn"
              onClick={() => setShowFormModal(false)}
              className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-purple transition-colors active:scale-95"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-ui font-bold text-bc-text flex items-center gap-2 mb-4">
              <UserPlus size={18} className="text-bc-text" />
              {isEditing
                ? "Modifier la Fiche Physique du Membre"
                : "Créer une Nouvelle Fiche Membre"}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Photo */}
              <div className="flex items-center gap-4">
                <Avatar src={avatarUrl || undefined} initials={`${firstName.charAt(0)}${lastName.charAt(0)}` || "?"} size="lg" />
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">Photo du membre</label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Prénom(s) *
                  </label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Nom de famille *
                  </label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Téléphone unique *
                  </label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Téléphone Parent/Proche
                  </label>
                  <input
                    id="form-phone-parent"
                    type="text"
                    value={phoneParent}
                    onChange={(e) => setPhoneParent(e.target.value)}
                    placeholder="+225..."
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              {/* Identity Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Genre *
                  </label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Date de Naissance *
                  </label>
                  <input
                    id="form-birthdate"
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    État Matrimonial
                  </label>
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
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Email
                  </label>
                  <input
                    id="form-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-bc-text mb-1">
                    Profession
                  </label>
                  <input
                    id="form-profession"
                    type="text"
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    placeholder="ex: Web designer"
                    className="w-full border border-bc-border rounded-full px-3 py-2 text-xs focus:outline-none focus:border-bc-green"
                  />
                </div>
              </div>

              {/* Territory & GPS Coordinates */}
              <div className="p-4 bg-bc-canvas/40 border border-bc-border rounded-[2rem] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text-secondary flex items-center gap-1">
                    <MapPin size={12} /> Maillage Territorial & GPS
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
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      Commune
                    </label>
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
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      Latitude
                    </label>
                    <input
                      id="form-lat"
                      type="text"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-full border border-bc-border rounded-full px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      Longitude
                    </label>
                    <input
                      id="form-lng"
                      type="text"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      className="w-full border border-bc-border rounded-full px-2 py-1 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Axis 1 & 2 & 3 Selection */}
              <div className="p-4 border border-bc-border rounded-[2rem] space-y-3 bg-bc-green/5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text flex items-center gap-1">
                  <Wrench size={12} className="text-bc-text-secondary" /> Grades
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      1. Niveau Communautaire
                    </label>
                    <select
                      id="form-community-level"
                      value={level}
                      onChange={(e) => setLevel(e.target.value as any)}
                      className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="Stagiaire">Stagiaire</option>
                      <option value="Boss">Boss</option>
                      <option value="Leader">Leader</option>
                      <option value="Coach">Coach</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      2. Cursus Pastoral
                    </label>
                    <select
                      id="form-pastoral-cursus"
                      value={pastoralCursus}
                      onChange={(e) => setPastoralCursus(e.target.value as any)}
                      className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="Aucun">Aucun</option>
                      <option value="Appelé">Appelé</option>
                      <option value="Serviteur">Serviteur</option>
                      <option value="Gagneur d'âme">Gagneur d'âme</option>
                      <option value="Assistant Pasteur">
                        Assistant Pasteur
                      </option>
                      <option value="Pasteur Assistant">
                        Pasteur Assistant
                      </option>
                      <option value="Pasteur Titulaire">
                        Pasteur Titulaire
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      Branche d'affectation
                    </label>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      Département
                    </label>
                    <select
                      id="form-dept-name"
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                      className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      {INITIAL_DEPARTMENTS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-bc-text-secondary mb-1">
                      Fonction occupée
                    </label>
                    <select
                      id="form-dept-role"
                      value={deptRole}
                      onChange={(e) => setDeptRole(e.target.value as any)}
                      className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="Membre">Membre</option>
                      <option value="Adjoint">Adjoint</option>
                      <option value="Responsable">Responsable</option>
                      <option value="Capitaine de Bus">Capitaine de Bus</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDepts((prev) => ({ ...prev, [deptName]: deptRole }))}
                  className="text-xs font-bold text-bc-green hover:underline active:scale-95"
                >
                  + Ajouter cette affectation
                </button>
                {Object.keys(depts).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(depts).map(([dId, fn]) => (
                      <span
                        key={dId}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-bc-green/10 text-xs text-bc-text"
                      >
                        {INITIAL_DEPARTMENTS.find((d) => d.id === dId)?.name ?? dId} · {fn}
                        <button
                          type="button"
                          aria-label={`Retirer ${dId}`}
                          onClick={() =>
                            setDepts((prev) => {
                              const next = { ...prev };
                              delete next[dId];
                              return next;
                            })
                          }
                          className="text-bc-text-secondary hover:text-bc-danger active:scale-95"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Baptême (§7) — statut + date + via département / hors process */}
              <div className="border-t border-bc-border pt-4">
                <label className="block text-[10px] font-bold text-bc-text-secondary mb-2">
                  Baptême
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={baptismStatus}
                    onChange={(e) => setBaptismStatus(e.target.value as "Non baptisé" | "Baptisé")}
                    className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white"
                  >
                    <option value="Non baptisé">Non baptisé</option>
                    <option value="Baptisé">Baptisé</option>
                  </select>
                  {baptismStatus === "Baptisé" && (
                    <>
                      <input
                        type="date"
                        value={baptismDate}
                        onChange={(e) => setBaptismDate(e.target.value)}
                        className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white"
                      />
                      <select
                        value={baptismViaDepartment ? "dep" : "hors"}
                        onChange={(e) => setBaptismViaDepartment(e.target.value === "dep")}
                        className="w-full border border-bc-border rounded-full px-3 py-1.5 text-xs bg-white"
                      >
                        <option value="dep">Via dép. Baptême</option>
                        <option value="hors">Hors process</option>
                      </select>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-bc-border">
                <button
                  id="form-cancel-btn"
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas active:scale-95"
                >
                  Annuler
                </button>
                <button
                  id="form-submit-btn"
                  type="submit"
                  className={`px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 active:scale-95 ${"bg-bc-green"}`}
                >
                  Sauvegarder la Fiche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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
  Wrench
} from "lucide-react";
import { Member, Branch, CommunityLevel, PastoralCursus } from "../types";
import { INITIAL_DEPARTMENTS, INITIAL_BUS_LINES } from "../mockData";
import Member360View from "./Member360View";

interface MembersViewProps {
  members: Member[];
  onUpdateMember: (member: Member) => void;
  onAddMember: (member: Member) => void;
  activeBranch: Branch;
  simulatedRole: string;
}

export default function MembersView({
  members,
  onUpdateMember,
  onAddMember,
  activeBranch,
  simulatedRole,
}: MembersViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBranch, setFilterBranch] = useState<Branch | "all">("all");
  const [filterLevel, setFilterLevel] = useState<CommunityLevel | "all">("all");
  const [filterPastoralCursus, setFilterPastoralCursus] = useState<PastoralCursus | "all">("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showMember360, setShowMember360] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form Fields State
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
  const [deptName, setDeptName] = useState("dept_louange");
  const [deptRole, setDeptRole] = useState<
    "Responsable" | "Adjoint" | "Membre" | "Capitaine de Bus"
  >("Membre");

  const isChurch = activeBranch === "church";

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

      const matchesBranch = filterBranch === "all" || m.branch === filterBranch;
      const matchesLevel = filterLevel === "all" || m.level === filterLevel;
      const matchesPastoralCursus = filterPastoralCursus === "all" || m.pastoralCursus === filterPastoralCursus;

      const matchesDept =
        filterDept === "all" || Object.keys(m.departments).includes(filterDept);

      return matchesSearch && matchesBranch && matchesLevel && matchesPastoralCursus && matchesDept;
    })
    .sort((a, b) => {
      // Sort alphabetically by last name, then first name
      const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
      const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const open360View = (member: Member) => {
    setSelectedMember(member);
    setShowMember360(true);
  };

  const openAddForm = () => {
    setIsEditing(false);
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
    setDeptName("dept_louange");
    setDeptRole("Membre");
    setShowFormModal(true);
  };

  const openEditForm = (member: Member) => {
    setIsEditing(true);
    setSelectedMember(member);
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

    // Get first department key as default
    const firstDept = Object.keys(member.departments)[0] || "dept_louange";
    setDeptName(firstDept);
    setDeptRole((member.departments[firstDept] as any) || "Membre");

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

    const gpsCoords = {
      lat: parseFloat(lat) || 5.3854,
      lng: parseFloat(lng) || -3.9781,
      commune,
    };

    const updatedDepartments = {
      [deptName]: deptRole as any,
    };

    if (isEditing && selectedMember) {
      const updated: Member = {
        ...selectedMember,
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
        departments: updatedDepartments,
        hasPassedToBossForm: true,
      };
      onUpdateMember(updated);
    } else {
      const newMember: Member = {
        id: `mem_custom_${Date.now()}`,
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

          {/* Branch filter */}
          <select
            id="member-filter-branch"
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value as any)}
            className="border border-bc-border rounded-full text-xs py-2 px-3 bg-white focus:outline-none focus:border-bc-green"
          >
            <option value="all">Toutes les branches</option>
            <option value="church">Bloom Church</option>
            <option value="light">Bloom Light</option>
          </select>

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
        </div>

        {/* Action Button & View Toggle */}
        <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
          <div className="flex bg-slate-100 p-1 rounded-full shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-full transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-bc-text" : "text-bc-text-secondary hover:text-slate-700"}`}
              title="Vue en grille"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-full transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-bc-text" : "text-bc-text-secondary hover:text-slate-700"}`}
              title="Vue en liste"
            >
              <List size={16} />
            </button>
          </div>

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
        <div className="flex items-center gap-6 text-xs font-medium text-bc-text-secondary bg-white px-4 py-2 rounded-full border border-bc-border shadow-sm">
          <span className="font-bold text-slate-700">Total affiché : {filteredMembers.length}</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Hommes : {filteredMembers.filter(m => m.gender === 'H').length}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-pink-400"></span>
            Femmes : {filteredMembers.filter(m => m.gender === 'F').length}
          </div>
        </div>
      </div>

      {/* Grid or List of Members */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredMembers.length === 0 ? (
            <div className="bg-white border border-bc-border shadow-sm p-12 text-center rounded-[2rem] sm:col-span-2 lg:col-span-3 xl:col-span-4 text-bc-text-secondary">
              <p className="text-sm">
                Aucun membre ne correspond à vos filtres.
              </p>
            </div>
          ) : (
            filteredMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => open360View(member)}
                className="bg-white border border-bc-border shadow-sm rounded-2xl p-4 hover:shadow-md transition-shadow flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div
                        className={`w-9 h-9 shrink-0 rounded-full font-ui font-black flex items-center justify-center border-2 text-[10px] ${
                          member.branch === "church"
                            ? "bg-bc-green/10 text-bc-text border-emerald-500/30"
                            : "bg-bc-green/10 text-bc-text border-orange-500/30"
                        }`}
                      >
                        {member.firstName[0]}
                        {member.lastName[0]}
                      </div>
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
                        className="p-3 shrink-0 rounded-xl text-slate-400 hover:text-bc-text hover:bg-bc-canvas transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center justify-center min-w-[48px] min-h-[48px]"
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
                    <span className="text-slate-300">•</span>
                    <div className="flex items-center space-x-1 truncate">
                      <MapPin size={10} />
                      <span className="truncate">
                        {member.gps?.commune || "Abidjan"}
                      </span>
                    </div>
                  </div>

                  {/* Primary Axes Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        member.level === "Coach"
                          ? "bg-purple-50 text-purple-600"
                          : member.level === "Leader"
                            ? "bg-fuchsia-50 text-fuchsia-600"
                            : member.level === "Boss"
                              ? "bg-slate-100 text-slate-700"
                              : "bg-bc-canvas text-bc-text-secondary"
                      }`}
                    >
                      🎓 {member.level}
                    </span>

                    {member.pastoralCursus !== "Aucun" && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">
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
                            <span key={id} className="text-slate-700 font-bold">
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
                      <span className="italic text-slate-400">
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
              </div>
            ))
          )}
        </div>
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
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="hover:bg-bc-canvas transition-colors group cursor-pointer"
                      onClick={() => open360View(member)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-8 h-8 shrink-0 rounded-full font-ui font-black flex items-center justify-center border-2 text-[9px] ${
                              member.branch === "church"
                                ? "bg-bc-green/10 text-bc-text border-emerald-500/30"
                                : "bg-bc-green/10 text-bc-text border-orange-500/30"
                            }`}
                          >
                            {member.firstName[0]}
                            {member.lastName[0]}
                          </div>
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
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Phone size={10} /> {member.phone}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <MapPin size={10} />{" "}
                            {member.gps?.commune || "Abidjan"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                              member.level === "Coach"
                                ? "bg-purple-50 text-purple-600"
                                : member.level === "Leader"
                                  ? "bg-fuchsia-50 text-fuchsia-600"
                                  : member.level === "Boss"
                                    ? "bg-slate-100 text-slate-700"
                                    : "bg-bc-canvas text-bc-text-secondary"
                            }`}
                          >
                            🎓 {member.level}
                          </span>
                          {member.pastoralCursus !== "Aucun" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">
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
                                    className="text-slate-700 font-bold truncate max-w-[150px]"
                                  >
                                    {dName}
                                  </span>
                                );
                              },
                            )
                          ) : (
                            <span className="italic text-slate-400">Aucun</span>
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
                            className="p-1.5 rounded-xl text-slate-400 hover:text-bc-text hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100 inline-flex"
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
          onEdit={(m) => {
            setShowMember360(false);
            openEditForm(m);
          }}
        />
      )}

      {/* Member Form Modal (Fiche Complète) */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] max-w-2xl w-full p-6 border border-bc-border shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              id="close-form-modal-btn"
              onClick={() => setShowFormModal(false)}
              className="absolute top-4 right-4 p-2 text-bc-text-secondary hover:text-bc-purple transition-colors"
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
                      className={`flex-1 py-1.5 text-xs font-bold rounded-full border ${gender === "H" ? "bg-bc-green text-white border-bc-green" : "border-bc-border"}`}
                    >
                      Homme
                    </button>
                    <button
                      id="form-gender-f"
                      type="button"
                      onClick={() => setGender("F")}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-full border ${gender === "F" ? "bg-bc-green text-white border-bc-green" : "border-bc-border"}`}
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
                <span className="text-[10px] uppercase font-bold tracking-wider text-bc-text-secondary flex items-center gap-1">
                  <MapPin size={12} /> Maillage Territorial & GPS
                </span>
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
                  <Wrench size={12} className="text-slate-600" /> Les Trois Axes Indépendants
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
                    <select
                      id="form-branch"
                      value={memberBranch}
                      onChange={(e) => setMemberBranch(e.target.value as any)}
                      className="w-full border border-bc-border rounded-full px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="church">Bloom Church</option>
                      <option value="light">Bloom Light</option>
                    </select>
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
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-bc-border">
                <button
                  id="form-cancel-btn"
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 border border-bc-border text-bc-text-secondary rounded-full text-xs hover:bg-bc-canvas"
                >
                  Annuler
                </button>
                <button
                  id="form-submit-btn"
                  type="submit"
                  className={`px-5 py-2 text-white rounded-full text-xs font-ui font-bold hover:opacity-90 ${"bg-bc-green"}`}
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

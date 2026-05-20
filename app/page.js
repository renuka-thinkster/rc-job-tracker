"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";

// ============================================================================
// Rolling Crunchy's — Job & Maintenance Tracker (Next.js, App Router)
// All state lives in localStorage on the client. We gate render behind a mount
// check at the bottom of this file so SSR doesn't try to touch localStorage.
// ============================================================================

    const DEFAULT_TEAM_MEMBERS = ["Deepa", "Meera", "Priya", "Ravi", "Sneha", "Vikram"];
    const REMOVED_MEMBERS      = ["Aman", "Rahul"]; // one-time cleanup on legacy localStorage
    const DEFAULT_JOB_TYPES    = ["Construction", "Electrical", "Exterior", "F&B", "Interior", "Maintenance", "Marketing", "Operations"];
    const JOB_CATEGORIES       = ["Critical", "High", "Low", "Medium"];
    const STATUSES             = ["WIP", "Hold", "Delayed", "Completed"];
    const sortAlpha = (arr) => [...arr].sort((a, b) => a.localeCompare(b));

    // ----- Maintenance tracker constants -----
    const DEFAULT_MAINT_CATEGORIES = [
      { name: "Refrigeration",     defaultAssignee: "", slaDays: 1 },
      { name: "Plumbing",          defaultAssignee: "", slaDays: 1 },
      { name: "Electrical",        defaultAssignee: "", slaDays: 2 },
      { name: "AC / HVAC",         defaultAssignee: "", slaDays: 2 },
      { name: "Kitchen Equipment", defaultAssignee: "", slaDays: 2 },
      { name: "IT / POS",          defaultAssignee: "", slaDays: 2 },
      { name: "Cleaning",          defaultAssignee: "", slaDays: 1 },
      { name: "Furniture",         defaultAssignee: "", slaDays: 5 },
      { name: "Other",             defaultAssignee: "", slaDays: 3 },
    ];

    const MAINT_STATUSES = ["Open", "InProgress", "Resolved"];

    const MAINT_STATUS_COLORS = {
      Open:       { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6", label: "Open" },
      InProgress: { bg: "#fef3c7", text: "#b45309", dot: "#f59e0b", label: "In Progress" },
      Resolved:   { bg: "#dcfce7", text: "#15803d", dot: "#22c55e", label: "Resolved" },
    };

    const STATUS_COLORS = {
      WIP:       { bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
      Hold:      { bg: "#fef3c7", text: "#b45309", dot: "#f59e0b" },
      Delayed:   { bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444" },
      Completed: { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
    };

    const CAT_COLORS = {
      Critical: { bg: "#fee2e2", text: "#b91c1c" },
      High:     { bg: "#ffedd5", text: "#c2410c" },
      Medium:   { bg: "#fef3c7", text: "#b45309" },
      Low:      { bg: "#dcfce7", text: "#15803d" },
    };

    const BRAND        = "#e8813a";
    const BRAND_DARK   = "#c66a25";
    const BRAND_TINT   = "#fff4ec";
    const TEXT         = "#0f172a";
    const TEXT_MUTED   = "#64748b";
    const TEXT_FAINT   = "#94a3b8";
    const BORDER       = "#e2e8f0";
    const SURFACE      = "#ffffff";
    const SURFACE_ALT  = "#f8fafc";

    function cycleTime(creationDate) {
      if (!creationDate) return 0;
      const created = new Date(creationDate);
      return Math.floor((Date.now() - created) / 86400000);
    }

    function isDelayed(job) {
      if (job.status === "Completed") return false;
      if (!job.endDate) return false;
      return new Date() > new Date(job.endDate);
    }

    function generateId() {
      return "JOB-" + Date.now().toString(36).toUpperCase();
    }

    const today       = () => new Date().toISOString().split("T")[0];
    const daysAgo     = (n) => new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
    const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];

    function normaliseJob(j) {
      const n = {
        ticketNumber: "",
        additionalAssignees: [],
        transfers: [],
        handoffs: [],
        photos: { before: [], after: [] },
        estimation: null,
        jobUpdates: [],
        statusHistory: [],
        completedDate: "",
        ...j,
        photos: { before: [], after: [], ...(j.photos || {}) },
      };
      if (n.status === "Completed" && !n.completedDate) {
        const lastCompletion = (n.statusHistory || []).filter(s => s.to === "Completed").slice(-1)[0];
        n.completedDate = lastCompletion ? lastCompletion.date.split("T")[0] : (n.endDate || "");
      }
      return n;
    }

    function completionTiming(job) {
      if (job.status !== "Completed" || !job.endDate || !job.completedDate) return null;
      const end  = new Date(job.endDate + "T00:00:00");
      const done = new Date((job.completedDate + "").slice(0, 10) + "T00:00:00");
      const diff = Math.round((done - end) / 86400000);
      if (diff < 0) return { kind: "early",   days: Math.abs(diff) };
      if (diff === 0) return { kind: "ontime", days: 0 };
      return { kind: "delayed", days: diff };
    }

    function readTicketCounter() {
      try { return parseInt(localStorage.getItem("rc_ticket_counter") || "0", 10) || 0; }
      catch { return 0; }
    }
    function writeTicketCounter(n) {
      try { localStorage.setItem("rc_ticket_counter", String(n)); } catch {}
    }
    function nextTicketNumber() {
      const n = readTicketCounter() + 1;
      writeTicketCounter(n);
      return "RC-" + String(n).padStart(4, "0");
    }

    function nextMaintTicket() {
      let n = 0;
      try { n = parseInt(localStorage.getItem("rc_maint_counter") || "0", 10) || 0; } catch {}
      n += 1;
      try { localStorage.setItem("rc_maint_counter", String(n)); } catch {}
      return "MNT-" + String(n).padStart(4, "0");
    }

    function normaliseMaintRequest(r) {
      return {
        ticketNumber: "",
        equipment: "",
        category: "",
        description: "",
        requestedBy: "",
        requestedDate: new Date().toISOString(),
        assignedTo: "",
        expectedDays: 3,
        status: "Open",
        photosBefore: [],
        photosAfter: [],
        invoicePhotos: [],
        vendorName: "",
        invoiceNumber: "",
        amountSpent: 0,
        resolutionNote: "",
        resolvedDate: "",
        updates: [],
        ...r,
      };
    }

    function maintAgeDays(req) {
      if (!req.requestedDate) return 0;
      return Math.floor((Date.now() - new Date(req.requestedDate)) / 86400000);
    }

    function isMaintDelayed(req) {
      if (req.status === "Resolved") return false;
      return maintAgeDays(req) > (req.expectedDays || 0);
    }

    function maintTiming(req) {
      if (req.status !== "Resolved" || !req.resolvedDate) return null;
      const requested = new Date(req.requestedDate);
      const resolved  = new Date(req.resolvedDate);
      const actual    = Math.max(0, Math.round((resolved - requested) / 86400000));
      const expected  = req.expectedDays || 0;
      const diff      = actual - expected;
      if (diff < 0) return { kind: "early",   days: Math.abs(diff), actual, expected };
      if (diff === 0) return { kind: "ontime", days: 0, actual, expected };
      return { kind: "delayed", days: diff, actual, expected };
    }

    function compressImage(file, maxWidth = 1000, quality = 0.7) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, maxWidth / img.width);
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            try { resolve(canvas.toDataURL("image/jpeg", quality)); }
            catch (err) { reject(err); }
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function formatINR(n) {
      const num = Number(n);
      if (!Number.isFinite(num) || num === 0) return "—";
      return "₹" + num.toLocaleString("en-IN");
    }

    function RCLogo({ size = 56 }) {
      const rays = [];
      const N = 60;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const r1 = 46.5, r2 = 49.5;
        rays.push(
          <line key={i}
            x1={50 + r1 * Math.cos(a)} y1={50 + r1 * Math.sin(a)}
            x2={50 + r2 * Math.cos(a)} y2={50 + r2 * Math.sin(a)}
            stroke="#3a2a14" strokeWidth="0.45" opacity="0.65" strokeLinecap="round" />
        );
      }
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))" }}>
          <defs>
            <path id="rcArcTop"    d="M 22 50 A 28 28 0 0 1 78 50" />
            <path id="rcArcBottom" d="M 22 53 A 28 28 0 0 0 78 53" />
          </defs>
          <circle cx="50" cy="50" r="49.6" fill="#ffffff" />
          <g>{rays}</g>
          <circle cx="50.2" cy="50" r="44.2" fill="none" stroke="#1ea54a" strokeWidth="2.3" />
          <circle cx="49.7" cy="50.2" r="44.5" fill="none" stroke="#16a34a" strokeWidth="0.9" opacity="0.55" />
          <circle cx="50" cy="50" r="38" fill="#ea8425" />
          <circle cx="50" cy="50" r="38" fill="none" stroke="#3a1f0a" strokeWidth="1.1" opacity="0.85" />
          <circle cx="50.4" cy="49.7" r="37.2" fill="none" stroke="#3a1f0a" strokeWidth="0.5" opacity="0.5" />
          <text fontFamily="'Brush Script MT','Lucida Handwriting','Apple Chancery',cursive" fontSize="14" fontWeight="700" fontStyle="italic" fill="#ffffff" stroke="#3a1f0a" strokeWidth="0.35" paintOrder="stroke">
            <textPath href="#rcArcTop" startOffset="50%" textAnchor="middle">Rolling</textPath>
          </text>
          <text fontFamily="'Brush Script MT','Lucida Handwriting','Apple Chancery',cursive" fontSize="14" fontWeight="700" fontStyle="italic" fill="#ffffff" stroke="#3a1f0a" strokeWidth="0.35" paintOrder="stroke">
            <textPath href="#rcArcBottom" startOffset="50%" textAnchor="middle">Crunchy's</textPath>
          </text>
          <g transform="translate(54 70) rotate(-22)">
            <rect x="-32" y="-2.8" width="6.5" height="5.6" rx="1.6" fill="#7a3e10" stroke="#3a1f0a" strokeWidth="0.5" />
            <rect x="25.5" y="-2.8" width="6.5" height="5.6" rx="1.6" fill="#7a3e10" stroke="#3a1f0a" strokeWidth="0.5" />
            <rect x="-27" y="-7" width="54" height="14" rx="4" fill="#d97237" stroke="#3a1f0a" strokeWidth="0.9" />
            <line x1="-17" y1="-5.5" x2="-17" y2="5.5" stroke="#3a1f0a" strokeWidth="0.5" opacity="0.55" />
            <line x1="-6"  y1="-5.5" x2="-6"  y2="5.5" stroke="#3a1f0a" strokeWidth="0.5" opacity="0.55" />
            <line x1="6"   y1="-5.5" x2="6"   y2="5.5" stroke="#3a1f0a" strokeWidth="0.5" opacity="0.55" />
            <line x1="17"  y1="-5.5" x2="17"  y2="5.5" stroke="#3a1f0a" strokeWidth="0.5" opacity="0.55" />
            <rect x="-27" y="-7" width="54" height="3" rx="3" fill="#ea8a52" opacity="0.55" />
          </g>
        </svg>
      );
    }

    function isAssigned(job, member) {
      return job.assignedTo === member || (job.additionalAssignees || []).includes(member);
    }

    const initialJobs = [
      {
        id: "JOB-DEMO3",
        title: "Green Canvas Canopy",
        description: "Fabricate and install exterior green canvas canopy with RC branding.",
        type: "Exterior",
        category: "Medium",
        assignedTo: "Priya",
        additionalAssignees: ["Meera", "Deepa"],
        creationDate: daysAgo(10),
        startDate: daysAgo(7),
        endDate: daysAgo(3),
        status: "Completed",
        remark: "Completed ahead of schedule",
        transfers: [],
      },
    ];

    function App() {
      // One-time cleanup: remove discontinued demo members + their demo jobs on first load
      const cleanupV2 = typeof localStorage !== "undefined" && localStorage.getItem("rc_cleanup_v2") !== "1";

      const [jobs, setJobs] = useState(() => {
        try {
          const saved = localStorage.getItem("rc_jobs");
          let parsed = saved ? JSON.parse(saved).map(normaliseJob) : initialJobs.map(normaliseJob);
          if (cleanupV2) {
            parsed = parsed.filter(j => j.id !== "JOB-DEMO1" && j.id !== "JOB-DEMO2");
            parsed = parsed.map(j => ({
              ...j,
              additionalAssignees: (j.additionalAssignees || []).filter(m => !REMOVED_MEMBERS.includes(m)),
            }));
          }
          parsed = parsed.map(j => j.ticketNumber ? j : { ...j, ticketNumber: nextTicketNumber() });
          return parsed;
        } catch { return initialJobs.map(normaliseJob); }
      });

      const [teamMembers, setTeamMembers] = useState(() => {
        try {
          const saved = JSON.parse(localStorage.getItem("rc_team") || "null");
          let members = Array.isArray(saved) && saved.length ? saved : DEFAULT_TEAM_MEMBERS;
          if (cleanupV2) members = members.filter(m => !REMOVED_MEMBERS.includes(m));
          return members;
        } catch { return DEFAULT_TEAM_MEMBERS; }
      });
      const [jobTypes, setJobTypes] = useState(() => {
        try {
          const saved = JSON.parse(localStorage.getItem("rc_types") || "null");
          return Array.isArray(saved) && saved.length ? saved : DEFAULT_JOB_TYPES;
        } catch { return DEFAULT_JOB_TYPES; }
      });
      const [memberPhones, setMemberPhones] = useState(() => {
        try { return JSON.parse(localStorage.getItem("rc_phones") || "{}"); }
        catch { return {}; }
      });
      const [memberRoles, setMemberRoles] = useState(() => {
        try { return JSON.parse(localStorage.getItem("rc_member_roles") || "{}"); }
        catch { return {}; }
      });

      const [maintRequests, setMaintRequests] = useState(() => {
        try {
          const saved = JSON.parse(localStorage.getItem("rc_maint_requests") || "null");
          return Array.isArray(saved) ? saved.map(normaliseMaintRequest) : [];
        } catch { return []; }
      });
      const [maintCategories, setMaintCategories] = useState(() => {
        try {
          const saved = JSON.parse(localStorage.getItem("rc_maint_categories") || "null");
          return Array.isArray(saved) && saved.length ? saved : DEFAULT_MAINT_CATEGORIES;
        } catch { return DEFAULT_MAINT_CATEGORIES; }
      });

      const [view, setView] = useState("dashboard");
      const [showForm, setShowForm] = useState(false);
      const [editJob, setEditJob] = useState(null);
      const [showTeamModal, setShowTeamModal] = useState(false);
      const [showTypesModal, setShowTypesModal] = useState(false);
      const [filterStatus, setFilterStatus] = useState("All");
      const [filterMember, setFilterMember] = useState("All");
      const [, setTick] = useState(0);
      const [alertDismissed, setAlertDismissed] = useState([]);

      const [showMaintForm, setShowMaintForm] = useState(false);
      const [editMaintReq, setEditMaintReq] = useState(null);
      const [showMaintCatsModal, setShowMaintCatsModal] = useState(false);
      const [resolveMaintTarget, setResolveMaintTarget] = useState(null);

      useEffect(() => {
        if (cleanupV2) { try { localStorage.setItem("rc_cleanup_v2", "1"); } catch {} }
      }, []); // eslint-disable-line

      useEffect(() => { try { localStorage.setItem("rc_jobs",   JSON.stringify(jobs)); } catch {} }, [jobs]);
      useEffect(() => { try { localStorage.setItem("rc_team",   JSON.stringify(teamMembers)); } catch {} }, [teamMembers]);
      useEffect(() => { try { localStorage.setItem("rc_types",  JSON.stringify(jobTypes)); } catch {} }, [jobTypes]);
      useEffect(() => { try { localStorage.setItem("rc_phones", JSON.stringify(memberPhones)); } catch {} }, [memberPhones]);
      useEffect(() => { try { localStorage.setItem("rc_member_roles", JSON.stringify(memberRoles)); } catch {} }, [memberRoles]);
      useEffect(() => { try { localStorage.setItem("rc_maint_requests",   JSON.stringify(maintRequests)); }   catch {} }, [maintRequests]);
      useEffect(() => { try { localStorage.setItem("rc_maint_categories", JSON.stringify(maintCategories)); } catch {} }, [maintCategories]);

      useEffect(() => {
        const t = setInterval(() => setTick(x => x + 1), 60000);
        return () => clearInterval(t);
      }, []);

      const activeJobs  = useMemo(() => jobs.filter(j => j.status !== "Completed"), [jobs]);
      const historyJobs = useMemo(() => jobs.filter(j => j.status === "Completed"), [jobs]);
      const delayedJobs = useMemo(() => activeJobs.filter(isDelayed), [activeJobs]);
      const newAlerts   = useMemo(() => delayedJobs.filter(j => !alertDismissed.includes(j.id)), [delayedJobs, alertDismissed]);
      const filteredActive = useMemo(() => activeJobs.filter(j =>
        (filterStatus === "All" || j.status === filterStatus) &&
        (filterMember === "All" || isAssigned(j, filterMember))
      ), [activeJobs, filterStatus, filterMember]);

      const [newJobToast, setNewJobToast] = useState(null);

      const saveJob = useCallback((data) => {
        let createdJob = null;
        setJobs(prev => {
          if (editJob) {
            const updated = prev.map(j => {
              if (j.id !== editJob.id) return j;
              const next = { ...j, ...data };
              if (data.status && data.status !== j.status) {
                next.statusHistory = [...(j.statusHistory || []), { from: j.status, to: data.status, date: new Date().toISOString() }];
                if (data.status === "Completed" && !next.completedDate) next.completedDate = today();
              }
              return next;
            });
            return updated;
          }
          const ticketNumber = nextTicketNumber();
          const fresh = normaliseJob({ ...data, id: generateId(), ticketNumber });
          if (fresh.status === "Completed" && !fresh.completedDate) fresh.completedDate = today();
          createdJob = fresh;
          return [...prev, fresh];
        });
        setShowForm(false);
        setEditJob(null);
        if (createdJob) setNewJobToast({ job: createdJob });
      }, [editJob]);

      const deleteJob = useCallback((id) => {
        if (!confirm("Delete this job? This cannot be undone.")) return;
        setJobs(prev => prev.filter(j => j.id !== id));
      }, []);

      const updateStatus = useCallback((id, status) => {
        setJobs(prev => prev.map(j => {
          if (j.id !== id) return j;
          if (j.status === status) return j;
          const next = {
            ...j, status,
            statusHistory: [...(j.statusHistory || []), { from: j.status, to: status, date: new Date().toISOString() }],
          };
          if (status === "Completed" && !next.completedDate) next.completedDate = today();
          return next;
        }));
      }, []);

      const addMember = useCallback((name, phone) => {
        const clean = name.trim();
        if (!clean) return { ok: false, error: "Name cannot be empty" };
        let exists = false;
        setTeamMembers(prev => {
          if (prev.some(m => m.toLowerCase() === clean.toLowerCase())) { exists = true; return prev; }
          return [...prev, clean];
        });
        if (exists) return { ok: false, error: `"${clean}" already exists` };
        const cleanPhone = (phone || "").replace(/\D/g, "");
        if (cleanPhone) setMemberPhones(prev => ({ ...prev, [clean]: cleanPhone }));
        return { ok: true };
      }, []);

      const deleteMember = useCallback((name) => {
        const assigned = jobs.filter(j => isAssigned(j, name));
        if (assigned.length > 0) {
          return { ok: false, error: `Cannot delete ${name} — they are on ${assigned.length} job${assigned.length > 1 ? "s" : ""}. Reassign first.` };
        }
        setTeamMembers(prev => prev.filter(m => m !== name));
        setMemberPhones(prev => { const next = { ...prev }; delete next[name]; return next; });
        if (filterMember === name) setFilterMember("All");
        return { ok: true };
      }, [jobs, filterMember]);

      const DEFAULT_ROLES = { requestor: true, assignee: true, accountsApprover: false, managerApprover: false };
      const getMemberRoles = useCallback((name) => ({ ...DEFAULT_ROLES, ...(memberRoles[name] || {}) }), [memberRoles]);
      const setMemberRole  = useCallback((name, role, val) => {
        setMemberRoles(prev => ({ ...prev, [name]: { ...DEFAULT_ROLES, ...(prev[name] || {}), [role]: !!val } }));
      }, []);
      const membersBy = useCallback((role) => teamMembers.filter(m => getMemberRoles(m)[role]), [teamMembers, getMemberRoles]);

      const setMemberPhone = useCallback((name, phone) => {
        const clean = (phone || "").replace(/\D/g, "");
        setMemberPhones(prev => {
          const next = { ...prev };
          if (clean) next[name] = clean; else delete next[name];
          return next;
        });
      }, []);

      const addJobType = useCallback((name) => {
        const clean = name.trim();
        if (!clean) return { ok: false, error: "Type cannot be empty" };
        let exists = false;
        setJobTypes(prev => {
          if (prev.some(t => t.toLowerCase() === clean.toLowerCase())) { exists = true; return prev; }
          return [...prev, clean];
        });
        return exists ? { ok: false, error: `"${clean}" already exists` } : { ok: true };
      }, []);

      const deleteJobType = useCallback((name) => {
        const used = jobs.filter(j => j.type === name);
        if (used.length > 0) {
          return { ok: false, error: `Cannot delete "${name}" — it is used by ${used.length} job${used.length > 1 ? "s" : ""}.` };
        }
        setJobTypes(prev => prev.filter(t => t !== name));
        return { ok: true };
      }, [jobs]);

      const savePhoneFor = useCallback((member, phone) => {
        if (!member || !phone) return;
        setMemberPhones(prev => ({ ...prev, [member]: phone }));
      }, []);

      function buildJobMessage(job, recipient) {
        const role = job.assignedTo === recipient ? "Primary Assignee" : "Co-worker";
        let msg = `*Rolling Crunchy's Job Tracker*\n\n`;
        msg += `🎫 *${job.ticketNumber}* — ${role}\n`;
        msg += `*${job.title}*\n`;
        if (job.description) msg += `${job.description.slice(0, 200)}${job.description.length > 200 ? "..." : ""}\n`;
        msg += `\n📋 Type: ${job.type}  |  Category: ${job.category}\n`;
        msg += `🚦 Status: ${job.status}\n`;
        msg += `📅 Due: ${job.endDate || "Not set"}\n`;
        if (job.startDate) msg += `🚀 Start: ${job.startDate}\n`;
        if (job.additionalAssignees?.length) msg += `👥 Co-workers: ${job.additionalAssignees.join(", ")}\n`;
        if (job.remark) msg += `💬 Remark: ${job.remark}\n`;
        if (job.estimation) {
          const ok = job.estimation.accountsApproved && job.estimation.adminApproved;
          msg += `💰 Estimation: ${formatINR(job.estimation.amount)} (${ok ? "Approved" : "Approval pending"})\n`;
        }
        msg += `\nPlease confirm receipt and update progress in the tracker.`;
        return msg;
      }

      const sendJobsToMember = useCallback((targetMember, jobsForMember, phoneOverride) => {
        if (!targetMember || !jobsForMember?.length) return;
        let phone = phoneOverride || memberPhones[targetMember] || "";
        if (!phone) {
          const entered = prompt(`Enter WhatsApp number for ${targetMember} (with country code, e.g. 919876543210):`);
          if (!entered) return;
          phone = entered;
        }
        const cleanPhone = phone.replace(/\D/g, "");
        if (cleanPhone.length < 8) { alert("Phone number looks too short."); return; }
        setMemberPhones(prev => ({ ...prev, [targetMember]: cleanPhone }));

        let body;
        if (jobsForMember.length === 1) {
          body = buildJobMessage(jobsForMember[0], targetMember);
        } else {
          body = `*Rolling Crunchy's Job Tracker*\n${jobsForMember.length} jobs assigned to *${targetMember}*:\n\n`;
          jobsForMember.forEach((j, i) => {
            const role = j.assignedTo === targetMember ? "Primary" : "Co-worker";
            body += `${i + 1}. 🎫 *${j.ticketNumber}* — *${j.title}* (${role})\n`;
            body += `   Type: ${j.type} | Category: ${j.category} | Status: ${j.status}\n`;
            body += `   Due: ${j.endDate || "Not set"} | Cycle: ${cycleTime(j.creationDate)}d\n`;
            if (j.remark) body += `   Remark: ${j.remark}\n`;
            body += `\n`;
          });
        }
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body)}`;
        window.open(url, "_blank");
      }, [memberPhones]);

      const sendSingleJob = useCallback((job) => {
        sendJobsToMember(job.assignedTo, [job]);
      }, [sendJobsToMember]);

      const [handoffTarget, setHandoffTarget] = useState(null);

      const saveMaintRequest = useCallback((data) => {
        if (editMaintReq) {
          setMaintRequests(prev => prev.map(r => r.id === editMaintReq.id ? normaliseMaintRequest({ ...r, ...data }) : r));
        } else {
          const cat = maintCategories.find(c => c.name === data.category);
          const fresh = normaliseMaintRequest({
            ...data, id: generateId(), ticketNumber: nextMaintTicket(),
            assignedTo: data.assignedTo || cat?.defaultAssignee || "",
            expectedDays: cat?.slaDays || 3,
            requestedDate: new Date().toISOString(),
            status: "Open",
          });
          setMaintRequests(prev => [...prev, fresh]);
        }
        setShowMaintForm(false);
        setEditMaintReq(null);
      }, [editMaintReq, maintCategories]);

      const deleteMaintRequest = useCallback((id) => {
        if (!confirm("Delete this maintenance request? This cannot be undone.")) return;
        setMaintRequests(prev => prev.filter(r => r.id !== id));
      }, []);

      const setMaintStatus = useCallback((id, status) => {
        setMaintRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      }, []);

      const addMaintUpdate = useCallback((id, by, note) => {
        setMaintRequests(prev => prev.map(r => r.id === id
          ? { ...r, updates: [...(r.updates || []), { by, note, date: new Date().toISOString() }], status: r.status === "Open" ? "InProgress" : r.status }
          : r));
      }, []);

      const resolveMaintRequest = useCallback((id, resolution) => {
        setMaintRequests(prev => prev.map(r => r.id === id
          ? { ...r, ...resolution, status: "Resolved", resolvedDate: resolution.resolvedDate || today() }
          : r));
        setResolveMaintTarget(null);
      }, []);

      const reopenMaintRequest = useCallback((id) => {
        if (!confirm("Re-open this resolved request?")) return;
        setMaintRequests(prev => prev.map(r => r.id === id ? { ...r, status: "InProgress", resolvedDate: "" } : r));
      }, []);

      const submitMaintEstimate = useCallback((id, amount, jobDetails, submittedBy) => {
        const amt = Math.max(0, Number(amount) || 0);
        const details = (jobDetails || "").trim();
        if (!details) return { ok: false, error: "Job details are required." };
        if (amt <= 0)  return { ok: false, error: "Amount must be greater than 0." };
        setMaintRequests(prev => prev.map(r => r.id === id ? {
          ...r,
          estimate: {
            amount: amt, jobDetails: details,
            submittedBy: submittedBy || r.assignedTo || "",
            submittedDate: new Date().toISOString(),
            accountsApproval: { approved: false, by: "", date: "", notes: "", rejected: false },
            managerApproval:  { approved: false, by: "", date: "", notes: "", rejected: false },
          },
          updates: [...(r.updates || []), {
            by: submittedBy || r.assignedTo || "System",
            note: `Estimate submitted: ${formatINR(amt)} — awaiting Accounts + Manager approval`,
            date: new Date().toISOString(),
          }],
        } : r));
        return { ok: true };
      }, []);

      const setMaintApproval = useCallback((id, which, payload) => {
        setMaintRequests(prev => prev.map(r => {
          if (r.id !== id || !r.estimate) return r;
          const next = { ...r.estimate };
          next[which] = {
            approved: !!payload.approved, rejected: !!payload.rejected,
            by: payload.by || "", date: payload.date || today(),
            notes: (payload.notes || "").trim(),
          };
          const label = which === "accountsApproval" ? "Accounts" : "Manager";
          const verb  = payload.approved ? "approved" : "rejected";
          return {
            ...r, estimate: next,
            updates: [...(r.updates || []), {
              by: payload.by || "System",
              note: `${label} ${verb} the estimate (${formatINR(r.estimate.amount)})${payload.notes ? ` — "${(payload.notes || "").trim()}"` : ""}`,
              date: new Date().toISOString(),
            }],
          };
        }));
      }, []);

      function buildMaintMessage(req) {
        const age = maintAgeDays(req);
        let msg = `*Rolling Crunchy's Maintenance*\n\n`;
        msg += `🔧 *${req.ticketNumber}* — Assignment\n`;
        msg += `*${req.equipment || "—"}*\n`;
        msg += `Category: ${req.category || "—"}\n`;
        msg += `SLA: ${req.expectedDays} day${req.expectedDays !== 1 ? "s" : ""}\n`;
        if (req.description) msg += `\nIssue: ${req.description}\n`;
        msg += `\nReported by: ${req.requestedBy || "—"}\n`;
        msg += `Reported: ${(req.requestedDate || "").slice(0, 10)}${age > 0 ? ` (${age}d ago)` : " (today)"}\n`;
        msg += `\nPlease attend to this and update progress in the tracker.`;
        return msg;
      }

      function buildMaintReminder(req) {
        const age = maintAgeDays(req);
        const delayed = isMaintDelayed(req);
        const overdueBy = delayed ? age - (req.expectedDays || 0) : 0;
        let msg;
        if (delayed) {
          msg  = `⚠ *URGENT REMINDER — ${req.ticketNumber}*\n\n`;
          msg += `🔧 *${req.equipment || "—"}* (${req.category || "—"})\n`;
          msg += `Reported ${age} day${age !== 1 ? "s" : ""} ago — *DELAYED by ${overdueBy} day${overdueBy !== 1 ? "s" : ""}* past the ${req.expectedDays}-day SLA.\n`;
          msg += `Current status: ${MAINT_STATUS_COLORS[req.status]?.label || req.status}\n`;
          if (req.description) msg += `\nIssue: ${req.description}\n`;
          msg += `\nThis needs immediate attention. Please update the tracker or escalate.`;
        } else {
          msg  = `🔔 *Reminder — ${req.ticketNumber}*\n\n`;
          msg += `🔧 *${req.equipment || "—"}* (${req.category || "—"})\n`;
          msg += `Reported ${age} day${age !== 1 ? "s" : ""} ago · SLA ${req.expectedDays} day${req.expectedDays !== 1 ? "s" : ""}\n`;
          msg += `Current status: ${MAINT_STATUS_COLORS[req.status]?.label || req.status}\n`;
          if (req.description) msg += `\nIssue: ${req.description}\n`;
          msg += `\nPlease share progress when you can. Update the tracker with the latest status.`;
        }
        return msg;
      }

      function openMaintWhatsApp(req, body, kind) {
        if (!req.assignedTo) { alert("This request has no assignee. Open the request and assign someone first."); return; }
        let phone = memberPhones[req.assignedTo] || "";
        if (!phone) {
          const entered = prompt(`No WhatsApp number saved for ${req.assignedTo}. Enter it now (with country code, e.g. 919876543210), or click Manage Team to save it:`);
          if (!entered) return;
          phone = entered.replace(/\D/g, "");
          if (phone.length < 8) { alert("Phone too short."); return; }
          setMemberPhones(prev => ({ ...prev, [req.assignedTo]: phone }));
        }
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
        window.open(url, "_blank");
        const note = kind === "reminder"
          ? (isMaintDelayed(req) ? "Urgent reminder sent via WhatsApp" : "Reminder sent via WhatsApp")
          : "Assignment notification sent via WhatsApp";
        setMaintRequests(prev => prev.map(r => r.id === req.id
          ? { ...r, updates: [...(r.updates || []), { by: "System", note, date: new Date().toISOString() }] }
          : r));
      }

      const sendMaintAssignment = useCallback((req) => openMaintWhatsApp(req, buildMaintMessage(req), "assignment"), [memberPhones]);
      const sendMaintReminder   = useCallback((req) => openMaintWhatsApp(req, buildMaintReminder(req), "reminder"), [memberPhones]);

      const sendWhatsAppToMember = useCallback((memberName, body, opts = {}) => {
        if (!memberName) return;
        let phone = memberPhones[memberName] || "";
        if (!phone) {
          const entered = prompt(`No WhatsApp number saved for ${memberName}. Enter it now (with country code, e.g. 919876543210), or click Manage Team to save it permanently:`);
          if (!entered) return;
          phone = entered.replace(/\D/g, "");
          if (phone.length < 8) { alert("Phone too short."); return; }
          setMemberPhones(prev => ({ ...prev, [memberName]: phone }));
        }
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
        window.open(url, "_blank");
        if (opts.logForReqId && opts.logNote) {
          setMaintRequests(prev => prev.map(r => r.id === opts.logForReqId
            ? { ...r, updates: [...(r.updates || []), { by: "System", note: opts.logNote, date: new Date().toISOString() }] }
            : r));
        }
      }, [memberPhones]);

      const upsertMaintCategory = useCallback((original, next) => {
        const clean = (next.name || "").trim();
        if (!clean) return { ok: false, error: "Category name is required" };
        const dup = maintCategories.some(c => c.name.toLowerCase() === clean.toLowerCase() && c.name !== original);
        if (dup) return { ok: false, error: `"${clean}" already exists` };
        const sla = Math.max(0, parseInt(next.slaDays, 10) || 0);
        setMaintCategories(prev => {
          if (!original) return [...prev, { name: clean, defaultAssignee: next.defaultAssignee || "", slaDays: sla }];
          return prev.map(c => c.name === original ? { name: clean, defaultAssignee: next.defaultAssignee || "", slaDays: sla } : c);
        });
        return { ok: true };
      }, [maintCategories]);

      const deleteMaintCategory = useCallback((name) => {
        const inUse = maintRequests.filter(r => r.category === name).length;
        if (inUse > 0) return { ok: false, error: `Cannot delete "${name}" — used by ${inUse} request${inUse > 1 ? "s" : ""}.` };
        setMaintCategories(prev => prev.filter(c => c.name !== name));
        return { ok: true };
      }, [maintRequests]);

      const performHandoff = useCallback((jobId, toMember, completionNote) => {
        setJobs(prev => prev.map(j => {
          if (j.id !== jobId) return j;
          const handoff = {
            from: j.assignedTo, to: toMember,
            completionNote: (completionNote || "").trim(),
            date: new Date().toISOString(),
          };
          const newCoworkers = (j.additionalAssignees || []).filter(m => m !== toMember);
          return { ...j, assignedTo: toMember, additionalAssignees: newCoworkers, handoffs: [...(j.handoffs || []), handoff] };
        }));
        setHandoffTarget(null);
      }, []);

      return (
        <div style={{ minHeight: "100vh", background: SURFACE_ALT }}>
          <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <RCLogo size={56} />
                <div style={{ fontSize: 10, color: TEXT_MUTED, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600 }}>Job Tracker</div>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {[
                  { key: "dashboard",   icon: "📊", label: "Dashboard" },
                  { key: "active",      icon: "⚡", label: "Active" },
                  { key: "history",     icon: "📁", label: "History" },
                  { key: "maintenance", icon: "🔧", label: "Maintenance" },
                ].map(n => (
                  <button key={n.key} className={`nav-btn ${view === n.key ? "active" : ""}`} onClick={() => setView(n.key)}>
                    <span>{n.icon}</span><span className="nav-label">{n.label}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-ghost hide-mobile" onClick={() => setShowTypesModal(true)} title="Manage Job Types">🏷</button>
                <button className="btn-ghost hide-mobile" onClick={() => setShowTeamModal(true)} title="Manage Team">👥</button>
                {view === "maintenance" ? (
                  <button className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => { setEditMaintReq(null); setShowMaintForm(true); }}>+ Maintenance Request</button>
                ) : (
                  <button className="btn-primary" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => { setEditJob(null); setShowForm(true); }}>+ New Job</button>
                )}
              </div>
            </div>
          </div>

          {newAlerts.length > 0 && (
            <div style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca", padding: "10px 24px" }}>
              <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="pulse" style={{ fontSize: 14 }}>🔴</span>
                  <span style={{ fontSize: 13, color: "#991b1b", fontWeight: 600 }}>
                    {newAlerts.length} job{newAlerts.length > 1 ? "s" : ""} overdue:&nbsp;
                    <span style={{ fontWeight: 500, color: "#b91c1c" }}>{newAlerts.map(j => j.title).join(", ")}</span>
                  </span>
                </div>
                <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setAlertDismissed(prev => [...prev, ...newAlerts.map(j => j.id)])}>Dismiss</button>
              </div>
            </div>
          )}

          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px" }}>
            {view === "dashboard" && (
              <Dashboard jobs={jobs} activeJobs={activeJobs} historyJobs={historyJobs} delayedJobs={delayedJobs}
                teamMembers={teamMembers} memberPhones={memberPhones} onSavePhone={savePhoneFor}
                onManageTeam={() => setShowTeamModal(true)}
                onMemberDrillDown={(m) => { setFilterMember(m); setFilterStatus("All"); setView("active"); }} />
            )}
            {view === "active" && (
              <ActiveJobs jobs={activeJobs} teamMembers={teamMembers} filterMember={filterMember} setFilterMember={setFilterMember}
                onEdit={(job) => { setEditJob(job); setShowForm(true); }} onDelete={deleteJob} onStatusChange={updateStatus}
                onSendJob={sendSingleJob} onHandoff={(job) => setHandoffTarget(job)} onManageTeam={() => setShowTeamModal(true)} />
            )}
            {view === "history" && (
              <HistoryJobs jobs={historyJobs} teamMembers={teamMembers}
                onEdit={(job) => { setEditJob(job); setShowForm(true); }} onDelete={deleteJob} onStatusChange={updateStatus} onSendJob={sendSingleJob} />
            )}
            {view === "maintenance" && (
              <MaintenanceView requests={maintRequests} categories={maintCategories} teamMembers={teamMembers}
                memberPhones={memberPhones} membersBy={membersBy}
                onCreate={() => { setEditMaintReq(null); setShowMaintForm(true); }}
                onEdit={(r) => { setEditMaintReq(r); setShowMaintForm(true); }}
                onDelete={deleteMaintRequest} onStatusChange={setMaintStatus} onAddUpdate={addMaintUpdate}
                onResolve={(r) => setResolveMaintTarget(r)} onReopen={reopenMaintRequest}
                onSendAssignment={sendMaintAssignment} onSendReminder={sendMaintReminder}
                onSubmitEstimate={submitMaintEstimate} onSetApproval={setMaintApproval}
                onSendWhatsApp={sendWhatsAppToMember}
                onManageCategories={() => setShowMaintCatsModal(true)} onManageTeam={() => setShowTeamModal(true)} />
            )}
          </div>

          {showForm && (
            <JobForm job={editJob} teamMembers={teamMembers} jobTypes={jobTypes} jobs={jobs}
              onSave={saveJob} onClose={() => { setShowForm(false); setEditJob(null); }}
              onManageTeam={() => setShowTeamModal(true)} onManageTypes={() => setShowTypesModal(true)} />
          )}
          {showTeamModal && (
            <TeamModal members={teamMembers} jobs={jobs} phones={memberPhones} getRoles={getMemberRoles}
              onAdd={addMember} onDelete={deleteMember} onSetPhone={setMemberPhone} onSetRole={setMemberRole}
              onClose={() => setShowTeamModal(false)} />
          )}
          {showTypesModal && (
            <JobTypesModal types={jobTypes} jobs={jobs} onAdd={addJobType} onDelete={deleteJobType} onClose={() => setShowTypesModal(false)} />
          )}
          {newJobToast && (
            <NewJobToast job={newJobToast.job} hasPhone={!!memberPhones[newJobToast.job.assignedTo]}
              onSend={() => { sendSingleJob(newJobToast.job); setNewJobToast(null); }} onDismiss={() => setNewJobToast(null)} />
          )}
          {handoffTarget && (
            <HandoffModal job={handoffTarget} teamMembers={teamMembers}
              onClose={() => setHandoffTarget(null)}
              onSubmit={(toMember, note) => performHandoff(handoffTarget.id, toMember, note)} />
          )}
          {showMaintForm && (
            <MaintenanceRequestForm request={editMaintReq} categories={maintCategories} teamMembers={teamMembers} membersBy={membersBy}
              onSave={saveMaintRequest} onClose={() => { setShowMaintForm(false); setEditMaintReq(null); }}
              onManageCategories={() => setShowMaintCatsModal(true)} onManageTeam={() => setShowTeamModal(true)} />
          )}
          {showMaintCatsModal && (
            <MaintenanceCategoriesModal categories={maintCategories} requests={maintRequests} teamMembers={teamMembers}
              onUpsert={upsertMaintCategory} onDelete={deleteMaintCategory} onClose={() => setShowMaintCatsModal(false)} />
          )}
          {resolveMaintTarget && (
            <ResolveMaintenanceModal request={resolveMaintTarget} onClose={() => setResolveMaintTarget(null)}
              onSubmit={(data) => resolveMaintRequest(resolveMaintTarget.id, data)} />
          )}
        </div>
      );
    }

    function HandoffModal({ job, teamMembers, onClose, onSubmit }) {
      const noteRef = useRef(null);
      const candidates = useMemo(() => sortAlpha(teamMembers.filter(m => m !== job.assignedTo)), [teamMembers, job.assignedTo]);
      const [toMember, setToMember] = useState(candidates[0] || "");
      function submit() {
        if (!toMember) { alert("Choose who's taking over next."); return; }
        const note = (noteRef.current?.value || "").trim();
        if (!note) { alert("Please describe what was completed before handing off."); noteRef.current?.focus(); return; }
        onSubmit(toMember, note);
      }
      return (
        <ModalShell onClose={onClose} title="Handoff to next person"
                    subtitle={`${job.assignedTo} marks their part complete and passes ${job.ticketNumber || job.title} to the next person.`} maxWidth={500}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: 12, fontSize: 13, color: "#065f46" }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>🎫 {job.ticketNumber} · {job.title}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Current: <strong>{job.assignedTo}</strong> · Status: {job.status}</div>
            </div>
            <div>
              <label>What was completed? *</label>
              <input ref={noteRef} placeholder="e.g. Wall framing done, ready for plastering" autoFocus autoComplete="off"
                     onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />
            </div>
            <div>
              <label>Hand off to *</label>
              <select value={toMember} onChange={e => setToMember(e.target.value)}>
                {candidates.length === 0 && <option value="">No other members</option>}
                {candidates.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>
                The job stays active and will appear as pending in <strong>{toMember || "the next person"}</strong>'s workload.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" style={{ background: "#0891b2" }} onClick={submit}>🤝 Confirm Handoff</button>
            </div>
          </div>
        </ModalShell>
      );
    }

    function NewJobToast({ job, hasPhone, onSend, onDismiss }) {
      useEffect(() => {
        const t = setTimeout(onDismiss, 12000);
        return () => clearTimeout(t);
      }, []); // eslint-disable-line
      return (
        <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 250, maxWidth: 340 }}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(15,23,42,0.18)", padding: 16, animation: "slideIn 0.25s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: TEXT, fontSize: 13 }}>✓ Job created</span>
              <button onClick={onDismiss} style={{ background: "none", border: "none", color: TEXT_FAINT, cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 12, lineHeight: 1.4 }}>
              <span style={{ background: BRAND_TINT, color: BRAND, padding: "1px 8px", borderRadius: 100, fontWeight: 700, fontSize: 11, marginRight: 6 }}>{job.ticketNumber}</span>
              {job.title}
              <div style={{ marginTop: 4 }}>Assigned to <strong style={{ color: TEXT }}>{job.assignedTo}</strong></div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onSend} className="btn-primary" style={{ background: "#25d366", padding: "8px 14px", fontSize: 13, flex: 1 }}>
                📤 {hasPhone ? "Send on WhatsApp" : "Send (enter number)"}
              </button>
              <button onClick={onDismiss} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}>Skip</button>
            </div>
          </div>
        </div>
      );
    }

    function Dashboard({ jobs, activeJobs, historyJobs, delayedJobs, teamMembers, memberPhones, onSavePhone, onManageTeam, onMemberDrillDown }) {
      return (
        <div className="slide-in">
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: TEXT, fontWeight: 700 }}>Dashboard</h2>
            <p style={{ color: TEXT_MUTED, fontSize: 13, marginTop: 4 }}>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Jobs", value: jobs.length, icon: "📋", color: TEXT },
              { label: "Active", value: activeJobs.length, icon: "⚡", color: "#15803d" },
              { label: "Delayed", value: delayedJobs.length, icon: "⚠️", color: "#b91c1c" },
              { label: "Completed", value: historyJobs.length, icon: "✅", color: "#1d4ed8" },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>{s.label}</span>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                </div>
                <div style={{ fontSize: 30, fontWeight: 700, color: s.color, lineHeight: 1, letterSpacing: "-0.02em" }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 12, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>Status Breakdown</div>
              {STATUSES.map(s => {
                const count = jobs.filter(j => j.status === s).length;
                const pct = jobs.length ? Math.round((count / jobs.length) * 100) : 0;
                const c = STATUS_COLORS[s];
                return (
                  <div key={s} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: TEXT, display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                        <span className="dot" style={{ background: c.dot }} />{s}
                      </span>
                      <span style={{ fontSize: 13, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{count} <span style={{ color: TEXT_FAINT }}>({pct}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: SURFACE_ALT, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: c.dot, borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>Team Workload</div>
                <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={onManageTeam}>👥 Manage</button>
              </div>
              <div style={{ fontSize: 11, color: TEXT_FAINT, marginBottom: 10 }}>Double-click a row to open that member's worklist</div>
              {sortAlpha(teamMembers).map(m => {
                const memberJobs = activeJobs.filter(j => isAssigned(j, m));
                if (!memberJobs.length) return null;
                const primaryCount = memberJobs.filter(j => j.assignedTo === m).length;
                const coCount = memberJobs.length - primaryCount;
                const delayed = memberJobs.filter(isDelayed).length;
                const criticalPending = memberJobs.filter(j => j.category === "Critical").length;
                return (
                  <div key={m} onDoubleClick={() => onMemberDrillDown && onMemberDrillDown(m)}
                       title={`Double-click to see ${m}'s active jobs`}
                       style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderBottom: `1px solid ${SURFACE_ALT}`, borderRadius: 6, cursor: "pointer", userSelect: "none" }}
                       onMouseEnter={e => e.currentTarget.style.background = SURFACE_ALT}
                       onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: BRAND_TINT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: BRAND }}>{m[0]}</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{m}</span>
                      {criticalPending > 0 && <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 10, fontWeight: 700 }}>🔴 {criticalPending} critical</span>}
                      {delayed > 0 && <span className="badge" style={{ background: "#fef3c7", color: "#b45309", fontSize: 10 }}>⚠ {delayed} late</span>}
                    </div>
                    <span style={{ fontSize: 13, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>{primaryCount} primary{coCount > 0 ? ` · ${coCount} co` : ""}</span>
                  </div>
                );
              })}
              {activeJobs.length === 0 && <div style={{ color: TEXT_MUTED, fontSize: 13 }}>No active jobs</div>}
            </div>
          </div>
          <WhatsAppPanel activeJobs={activeJobs} teamMembers={teamMembers} memberPhones={memberPhones} onSavePhone={onSavePhone} onManageTeam={onManageTeam} />
          {delayedJobs.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 12, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                <span className="pulse">⚠️</span> Overdue Jobs
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {delayedJobs.map(j => (
                  <div key={j.id} className="card" style={{ borderLeft: "3px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: 14 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>{j.title}</div>
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>Assigned: {j.assignedTo}{j.additionalAssignees?.length ? ` +${j.additionalAssignees.length}` : ""} · Due: {j.endDate}</div>
                    </div>
                    <span className="badge" style={{ background: STATUS_COLORS.Delayed.bg, color: STATUS_COLORS.Delayed.text }}>Delayed</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    function WhatsAppPanel({ activeJobs, teamMembers, memberPhones, onSavePhone, onManageTeam }) {
      const [member, setMember] = useState("");
      const [ccRecipients, setCcRecipients] = useState([]);
      const [showAddCc, setShowAddCc] = useState(false);
      const [sentPhones, setSentPhones] = useState({});
      const ccPhoneRef = useRef(null);
      const ccLabelRef = useRef(null);
      const memberPhone = member ? (memberPhones[member] || "") : "";
      useEffect(() => { setSentPhones({}); }, [member]);

      const message = useMemo(() => {
        if (!member) return "";
        const list = activeJobs.filter(j => isAssigned(j, member));
        if (!list.length) return `Hi ${member}, you have no pending jobs currently. Keep it up!`;
        let msg = `*Rolling Crunchy's Job Tracker*\nPending Jobs for *${member}*:\n\n`;
        list.forEach((j, i) => {
          const role = j.assignedTo === member ? "Primary" : "Co-worker";
          msg += `${i + 1}. 🎫 *${j.ticketNumber || j.id}* — *${j.title}* (${role})\n   Type: ${j.type} | Category: ${j.category}\n   Status: ${j.status}\n   Due: ${j.endDate || "Not set"}\n   Cycle: ${cycleTime(j.creationDate)} days\n`;
          if (j.remark) msg += `   Remark: ${j.remark}\n`;
          msg += "\n";
        });
        return msg;
      }, [member, activeJobs]);

      function addMemberAsCc(name) {
        if (!name) return;
        const phone = memberPhones[name];
        if (!phone) { alert(`${name} has no WhatsApp number saved. Add it in Manage Team first.`); return; }
        if (ccRecipients.some(r => r.phone === phone)) return;
        setCcRecipients(prev => [...prev, { label: name, phone }]);
      }
      function addCustomCc() {
        const raw = ccPhoneRef.current?.value || "";
        const phone = raw.replace(/\D/g, "");
        if (phone.length < 8) { alert("Phone number too short."); return; }
        const label = (ccLabelRef.current?.value || "").trim() || `+${phone}`;
        if (ccRecipients.some(r => r.phone === phone)) { alert("Already added."); return; }
        setCcRecipients(prev => [...prev, { label, phone }]);
        ccPhoneRef.current.value = "";
        if (ccLabelRef.current) ccLabelRef.current.value = "";
        setShowAddCc(false);
      }
      function removeCc(phone) { setCcRecipients(prev => prev.filter(r => r.phone !== phone)); }

      const recipients = useMemo(() => {
        const list = [];
        if (member) list.push({ label: member, phone: memberPhone, isPrimary: true });
        ccRecipients.forEach(r => list.push({ ...r, isPrimary: false }));
        return list;
      }, [member, memberPhone, ccRecipients]);

      function openWaFor(recipient) {
        let phone = recipient.phone;
        if (!phone && recipient.isPrimary) {
          const entered = prompt(`No WhatsApp number saved for ${recipient.label}. Enter it now (with country code) or click Manage Team to save it:`);
          if (!entered) return;
          phone = entered.replace(/\D/g, "");
          if (phone.length < 8) { alert("Phone too short."); return; }
          onSavePhone(recipient.label, phone);
        }
        if (!phone) return;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, "_blank");
        setSentPhones(prev => ({ ...prev, [phone]: true }));
      }

      const ccCandidates = useMemo(() => sortAlpha(teamMembers.filter(m =>
        m !== member && memberPhones[m] && !ccRecipients.some(r => r.phone === memberPhones[m])
      )), [teamMembers, member, memberPhones, ccRecipients]);

      return (
        <div className="card" style={{ borderLeft: "3px solid #25d366" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 18 }}>💬</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>Send Pending List via WhatsApp</span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ margin: 0 }}>Select Staff Member</label>
              <button onClick={onManageTeam} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>👥 Manage Team</button>
            </div>
            <select value={member} onChange={e => setMember(e.target.value)}>
              <option value="">— Choose Member —</option>
              {sortAlpha(teamMembers).map(m => <option key={m} value={m}>{m}{memberPhones[m] ? "" : "  (no phone)"}</option>)}
            </select>
            {member && (
              <div style={{ marginTop: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {memberPhone ? (
                  <><span style={{ color: "#15803d", fontWeight: 500, fontFamily: "ui-monospace, monospace" }}>📱 +{memberPhone}</span>
                  <button onClick={onManageTeam} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0 }}>Change in Team master</button></>
                ) : (
                  <><span style={{ color: "#b45309", fontWeight: 500 }}>⚠ No phone saved for {member}</span>
                  <button onClick={onManageTeam} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0 }}>+ Add in Team master</button></>
                )}
              </div>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Also send to (optional)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, minHeight: 6 }}>
              {ccRecipients.length === 0 && <span style={{ fontSize: 12, color: TEXT_FAINT }}>No additional recipients</span>}
              {ccRecipients.map(r => (
                <span key={r.phone} className="chip">
                  {r.label} <span style={{ color: TEXT_FAINT, fontSize: 10, marginLeft: 2 }}>+{r.phone}</span>
                  <button type="button" onClick={() => removeCc(r.phone)} aria-label={`Remove ${r.label}`}>✕</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value="" onChange={e => { if (e.target.value === "__custom") setShowAddCc(true); else { addMemberAsCc(e.target.value); e.target.value = ""; } }} style={{ width: "auto", minWidth: 200, flex: 1 }}>
                <option value="">+ Add a recipient...</option>
                {ccCandidates.map(m => <option key={m} value={m}>{m} (+{memberPhones[m]})</option>)}
                <option value="__custom">+ Type a different number...</option>
              </select>
            </div>
            {showAddCc && (
              <div style={{ marginTop: 8, padding: 12, background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 6 }}>
                  <input ref={ccLabelRef} placeholder="Label (optional)" autoComplete="off" />
                  <input ref={ccPhoneRef} placeholder="Number e.g. 919876543210" autoComplete="off" inputMode="tel" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomCc(); } }} />
                  <button type="button" className="btn-primary" style={{ padding: "8px 12px", fontSize: 12 }} onClick={addCustomCc}>Add</button>
                  <button type="button" className="btn-ghost" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => setShowAddCc(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          {message && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: "#166534", fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace", whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto" }}>{message}</div>
          )}
          {recipients.length === 0 ? (
            <div style={{ fontSize: 13, color: TEXT_MUTED, fontStyle: "italic", padding: "10px 0" }}>Select a member to begin.</div>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>Send to {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recipients.map((r, i) => {
                  const sent = !!(r.phone && sentPhones[r.phone]);
                  return (
                    <div key={r.phone || ("idx-" + i)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", border: `1px solid ${sent ? "#bbf7d0" : BORDER}`, background: sent ? "#f0fdf4" : SURFACE, borderRadius: 8, gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: r.isPrimary ? BRAND_TINT : "#f1f5f9", color: r.isPrimary ? BRAND : TEXT_MUTED, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{(r.label || "?")[0]?.toUpperCase()}</span>
                        <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{r.label || "—"}</span>
                        {r.isPrimary && <span className="badge" style={{ background: BRAND_TINT, color: BRAND, fontSize: 10 }}>Primary</span>}
                        {r.phone ? <span style={{ fontSize: 11, color: TEXT_MUTED, fontFamily: "ui-monospace, monospace" }}>+{r.phone}</span> : <span style={{ fontSize: 11, color: "#b45309" }}>no phone</span>}
                      </div>
                      {sent ? <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>✓ Opened</span>
                            : <button className="btn-primary" onClick={() => openWaFor(r)} style={{ background: "#25d366", padding: "6px 14px", fontSize: 12, whiteSpace: "nowrap" }}>📤 Send</button>}
                    </div>
                  );
                })}
              </div>
              {recipients.length > 1 && <div style={{ marginTop: 10, fontSize: 11, color: TEXT_MUTED, lineHeight: 1.45 }}>💡 Click <strong>Send</strong> next to each recipient. WhatsApp opens one chat at a time — browsers block any attempt to open multiple tabs from a single click.</div>}
            </div>
          )}
        </div>
      );
    }

    function JobsTable({ jobs, teamMembers, history, onEdit, onDelete, onStatusChange, onSendJob, onHandoff, initialMember = "All", initialStatus = "All" }) {
      const [search, setSearch] = useState("");
      const [fType, setFType] = useState("All");
      const [fCategory, setFCategory] = useState("All");
      const [fStatus, setFStatus] = useState(initialStatus);
      const [fMember, setFMember] = useState(initialMember);
      const [sortKey, setSortKey] = useState(history ? "completedDate" : "endDate");
      const [sortDesc, setSortDesc] = useState(history);
      const [expandedId, setExpandedId] = useState(null);

      const allTypes = useMemo(() => {
        const set = new Set();
        jobs.forEach(j => j.type && set.add(j.type));
        return sortAlpha([...set]);
      }, [jobs]);

      const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let result = jobs.filter(j => {
          if (fType !== "All" && j.type !== fType) return false;
          if (fCategory !== "All" && j.category !== fCategory) return false;
          if (!history && fStatus !== "All" && j.status !== fStatus) return false;
          if (fMember !== "All" && !isAssigned(j, fMember)) return false;
          if (q) {
            const hay = [j.ticketNumber, j.title, j.assignedTo, j.type, j.category, j.remark, j.description, ...(j.additionalAssignees || [])].filter(Boolean).join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        result.sort((a, b) => {
          let aV = a[sortKey] || "";
          let bV = b[sortKey] || "";
          if (sortKey === "cycle") { aV = cycleTime(a.creationDate); bV = cycleTime(b.creationDate); }
          if (sortKey === "timingDays") {
            const at = completionTiming(a); const bt = completionTiming(b);
            aV = at ? (at.kind === "early" ? -at.days : at.days) : 0;
            bV = bt ? (bt.kind === "early" ? -bt.days : bt.days) : 0;
          }
          const cmp = (typeof aV === "number" && typeof bV === "number") ? aV - bV : ("" + aV).localeCompare("" + bV);
          return sortDesc ? -cmp : cmp;
        });
        return result;
      }, [jobs, search, fType, fCategory, fStatus, fMember, sortKey, sortDesc, history]);

      function toggleSort(key) {
        if (sortKey === key) setSortDesc(d => !d);
        else { setSortKey(key); setSortDesc(false); }
      }
      function SortHeader({ k, children, width }) {
        const active = sortKey === k;
        return (
          <th onClick={() => toggleSort(k)} style={{ padding: "10px 12px", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap", color: active ? BRAND : TEXT_MUTED, width, fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", borderBottom: `1px solid ${BORDER}`, background: SURFACE_ALT, position: "sticky", top: 0, zIndex: 1 }}>
            {children}{active ? (sortDesc ? " ↓" : " ↑") : ""}
          </th>
        );
      }

      return (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search ticket, title, member, remark..." autoComplete="off" />
            <select value={fType} onChange={e => setFType(e.target.value)}>
              <option value="All">All Types</option>
              {allTypes.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={fCategory} onChange={e => setFCategory(e.target.value)}>
              <option value="All">All Categories</option>
              {JOB_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            {!history && (
              <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
                <option value="All">All Status</option>
                {["WIP", "Hold", "Delayed"].map(s => <option key={s}>{s}</option>)}
              </select>
            )}
            <select value={fMember} onChange={e => setFMember(e.target.value)}>
              <option value="All">All Members</option>
              {sortAlpha(teamMembers).map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6 }}>
            Showing <strong style={{ color: TEXT }}>{filtered.length}</strong> of {jobs.length} job{jobs.length !== 1 ? "s" : ""}
            {(search || fType !== "All" || fCategory !== "All" || (!history && fStatus !== "All") || fMember !== "All") && (
              <button onClick={() => { setSearch(""); setFType("All"); setFCategory("All"); setFStatus("All"); setFMember("All"); }}
                      style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", marginLeft: 10, fontSize: 12, fontWeight: 600 }}>Clear filters</button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 40, color: TEXT_MUTED }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>{history ? "📁" : "🎉"}</div>
              <div style={{ fontSize: 14 }}>No jobs match these filters</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 10, background: SURFACE }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                <thead>
                  <tr>
                    <SortHeader k="ticketNumber" width={110}>🎫 Ticket</SortHeader>
                    <SortHeader k="title">Title</SortHeader>
                    <SortHeader k="type" width={120}>Type</SortHeader>
                    <SortHeader k="category" width={100}>Category</SortHeader>
                    <SortHeader k="assignedTo" width={140}>Assignee</SortHeader>
                    {history ? <SortHeader k="completedDate" width={120}>Completed</SortHeader> : <SortHeader k="status" width={110}>Status</SortHeader>}
                    <SortHeader k="endDate" width={110}>{history ? "Planned End" : "Due"}</SortHeader>
                    {history ? <SortHeader k="timingDays" width={140}>Timing</SortHeader> : <SortHeader k="cycle" width={90}>Cycle</SortHeader>}
                    <th style={{ padding: "10px 12px", textAlign: "right", borderBottom: `1px solid ${BORDER}`, background: SURFACE_ALT, fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: TEXT_MUTED, position: "sticky", top: 0, zIndex: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((job, idx) => {
                    const isOpen = expandedId === job.id;
                    const delayed = isDelayed(job);
                    const ct = cycleTime(job.creationDate);
                    const sc = STATUS_COLORS[job.status] || STATUS_COLORS.WIP;
                    const cat = CAT_COLORS[job.category] || CAT_COLORS.Medium;
                    const t = completionTiming(job);
                    const extras = job.additionalAssignees || [];
                    return (
                      <React.Fragment key={job.id}>
                        <tr onClick={() => setExpandedId(isOpen ? null : job.id)} style={{ cursor: "pointer", background: isOpen ? "#fff7ed" : (idx % 2 === 0 ? SURFACE : SURFACE_ALT), borderLeft: delayed && !history ? "3px solid #ef4444" : "3px solid transparent" }}>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
                            <span className="badge" style={{ background: BRAND_TINT, color: BRAND, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{job.ticketNumber || "—"}</span>
                          </td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, fontWeight: 500, color: TEXT }}>
                            <span style={{ marginRight: 6, color: TEXT_FAINT, fontSize: 10 }}>{isOpen ? "▼" : "▶"}</span>{job.title}
                          </td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT_MUTED }}>{job.type}</td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}><span className="badge" style={{ background: cat.bg, color: cat.text }}>{job.category}</span></td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT }}>
                            {job.assignedTo}{extras.length > 0 && <span style={{ color: BRAND, fontWeight: 500, marginLeft: 4 }}>+{extras.length}</span>}
                          </td>
                          {history ? (
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT, whiteSpace: "nowrap" }}>{job.completedDate || "—"}</td>
                          ) : (
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
                              <span className="badge" style={{ background: sc.bg, color: sc.text }}><span className="dot" style={{ background: sc.dot }} />{job.status}</span>
                            </td>
                          )}
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT, whiteSpace: "nowrap" }}>{job.endDate || "—"}</td>
                          {history ? (
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
                              {t ? t.kind === "early"  ? <span className="badge" style={{ background: "#dcfce7", color: "#15803d", fontWeight: 700 }}>🏆 {t.days}d early</span>
                                 : t.kind === "ontime" ? <span className="badge" style={{ background: "#dbeafe", color: "#1d4ed8", fontWeight: 700 }}>✓ On Time</span>
                                                       : <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>⚠ {t.days}d late</span>
                                 : <span style={{ color: TEXT_FAINT }}>—</span>}
                            </td>
                          ) : (
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, fontWeight: delayed ? 700 : 400, color: delayed ? "#dc2626" : TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
                              <span className={delayed ? "pulse" : ""}>{ct}d{delayed ? " ⚠" : ""}</span>
                            </td>
                          )}
                          <td style={{ padding: "10px 8px", borderBottom: `1px solid ${BORDER}`, textAlign: "right", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                            {onSendJob && <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#15803d", marginLeft: 2 }} onClick={() => onSendJob(job)} title="Send">📤</button>}
                            {onHandoff && !history && <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#0891b2", marginLeft: 2 }} onClick={() => onHandoff(job)} title="Handoff">🤝</button>}
                            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, marginLeft: 2 }} onClick={() => onEdit(job)} title="Edit">✏️</button>
                            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#dc2626", marginLeft: 2 }} onClick={() => onDelete(job.id)} title="Delete">🗑️</button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr style={{ background: SURFACE }}>
                            <td colSpan={9} style={{ padding: 18, borderBottom: `1px solid ${BORDER}`, background: "#fffbf5" }}>
                              <JobCard embedded job={job} history={history}
                                onEdit={() => onEdit(job)} onDelete={() => onDelete(job.id)}
                                onStatusChange={s => onStatusChange(job.id, s)}
                                onSend={onSendJob ? () => onSendJob(job) : null}
                                onHandoff={onHandoff ? () => onHandoff(job) : null} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    function ActiveJobs({ jobs, teamMembers, filterMember, setFilterMember, onEdit, onDelete, onStatusChange, onSendJob, onHandoff, onManageTeam }) {
      return (
        <div className="slide-in">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700 }}>Active Jobs</h2>
            <button className="btn-ghost" onClick={onManageTeam}>👥 Team</button>
          </div>
          <JobsTable jobs={jobs} teamMembers={teamMembers} history={false}
            onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange}
            onSendJob={onSendJob} onHandoff={onHandoff} initialMember={filterMember} />
        </div>
      );
    }

    function HistoryJobs({ jobs, teamMembers, onEdit, onDelete, onStatusChange, onSendJob }) {
      return (
        <div className="slide-in">
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, marginBottom: 16 }}>Completed Jobs</h2>
          <JobsTable jobs={jobs} teamMembers={teamMembers} history={true}
            onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} onSendJob={onSendJob} />
        </div>
      );
    }

    function JobCard({ job, onEdit, onDelete, onStatusChange, onSend, onHandoff, history, embedded }) {
      const [expanded, setExpanded] = useState(embedded || !!history);
      const [lightbox, setLightbox] = useState(null);
      const delayed = isDelayed(job);
      const ct = cycleTime(job.creationDate);
      const sc = STATUS_COLORS[job.status] || STATUS_COLORS.WIP;
      const cat = CAT_COLORS[job.category] || CAT_COLORS.Medium;
      const extras = job.additionalAssignees || [];
      const transfers = job.transfers || [];
      const handoffs  = job.handoffs || [];
      const photosBefore = job.photos?.before || [];
      const photosAfter  = job.photos?.after  || [];
      const totalPhotos  = photosBefore.length + photosAfter.length;
      const updates      = job.jobUpdates || [];
      const est          = job.estimation;
      const timing       = completionTiming(job);

      return (
        <div className={embedded ? "" : "card slide-in"} style={embedded ? { padding: 0 } : { borderLeft: delayed && !history ? "3px solid #ef4444" : `1px solid ${BORDER}`, paddingLeft: delayed && !history ? 18 : 20 }}>
          {!embedded && (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {job.ticketNumber && <span className="badge" style={{ background: BRAND_TINT, color: BRAND, fontWeight: 700, fontFamily: "ui-monospace, 'SF Mono', Consolas, monospace" }}>🎫 {job.ticketNumber}</span>}
                <span style={{ fontWeight: 600, fontSize: 15, color: TEXT }}>{job.title}</span>
                <span className="badge" style={{ background: cat.bg, color: cat.text }}>{job.category}</span>
                {delayed && !history && <span className="badge pulse" style={{ background: STATUS_COLORS.Delayed.bg, color: STATUS_COLORS.Delayed.text }}>⚠ Overdue</span>}
                {history && timing && (
                  timing.kind === "early"   ? <span className="badge" style={{ background: "#dcfce7", color: "#15803d", fontWeight: 700 }}>🏆 {timing.days} day{timing.days !== 1 ? "s" : ""} early</span> :
                  timing.kind === "ontime"  ? <span className="badge" style={{ background: "#dbeafe", color: "#1d4ed8", fontWeight: 700 }}>✓ On Time</span> :
                                              <span className="badge" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>⚠ {timing.days} day{timing.days !== 1 ? "s" : ""} late</span>
                )}
                {transfers.length > 0 && <span className="badge" style={{ background: "#ede9fe", color: "#6d28d9" }}>↔ {transfers.length} transfer{transfers.length > 1 ? "s" : ""}</span>}
                {handoffs.length > 0 && <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>✓→ {handoffs.length} handoff{handoffs.length > 1 ? "s" : ""}</span>}
                {totalPhotos > 0 && <span className="badge" style={{ background: "#f1f5f9", color: "#475569" }}>📸 {totalPhotos}</span>}
                {updates.length > 0 && <span className="badge" style={{ background: "#f1f5f9", color: "#475569" }}>📝 {updates.length}</span>}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: TEXT_MUTED }}>
                <span>👤 {job.assignedTo}{extras.length > 0 && <span style={{ color: BRAND, fontWeight: 500 }}> +{extras.length} co</span>}</span>
                <span>🏷 {job.type}</span>
                <span>📅 Due: {job.endDate || "—"}</span>
                <span className={delayed && !history ? "pulse" : ""} style={{ color: delayed && !history ? "#dc2626" : TEXT_MUTED, fontWeight: delayed && !history ? 700 : 400 }}>⏱ Cycle: {ct}d{delayed && !history ? " ⚠" : ""}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <span className="badge" style={{ background: sc.bg, color: sc.text }}><span className="dot" style={{ background: sc.dot }} />{job.status}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setExpanded(x => !x)}>{expanded ? "▲" : "▼"}</button>
                {onSend && <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12, color: "#15803d" }} onClick={onSend} title="Send">📤</button>}
                {onHandoff && !history && <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12, color: "#0891b2" }} onClick={onHandoff} title="Handoff">🤝</button>}
                <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={onEdit}>✏️</button>
                <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12, color: "#dc2626" }} onClick={onDelete}>🗑️</button>
              </div>
            </div>
          </div>
          )}
          {expanded && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
              {history && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>Timeline</div>
                  <JobTimeline job={job} />
                </div>
              )}
              {job.description && <p style={{ fontSize: 13, color: "#334155", marginBottom: 12, lineHeight: 1.5 }}>{job.description}</p>}
              {extras.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Co-workers</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{extras.map(m => <span key={m} className="chip" style={{ paddingRight: 10 }}>{m}</span>)}</div>
                </div>
              )}
              <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, fontSize: 12, color: TEXT_MUTED }}>
                <div>📆 Created: <span style={{ color: TEXT }}>{job.creationDate}</span></div>
                <div>🚀 Start: <span style={{ color: TEXT }}>{job.startDate || "—"}</span></div>
                <div>🏁 Planned End: <span style={{ color: TEXT }}>{job.endDate || "—"}</span></div>
                {history && job.completedDate
                  ? <div>✅ Completed On: <span style={{ color: TEXT }}>{job.completedDate}</span></div>
                  : <div>⏱ Cycle time: <strong className={delayed && !history ? "pulse" : ""} style={{ color: delayed && !history ? "#dc2626" : BRAND }}>{ct} days{delayed && !history ? " (overdue)" : ""}</strong></div>
                }
              </div>
              {job.remark && <div style={{ background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#475569", marginBottom: 12 }}>💬 {job.remark}</div>}
              {transfers.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Transfer History</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {transfers.map((t, i) => (
                      <div key={i} style={{ background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                        <div style={{ color: TEXT, fontWeight: 500 }}>
                          <span style={{ color: TEXT_MUTED }}>{t.from}</span> → <span style={{ color: BRAND }}>{t.to}</span>
                          <span style={{ color: TEXT_FAINT, fontSize: 11, marginLeft: 8 }}>{new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </div>
                        <div style={{ color: "#475569", marginTop: 2 }}>"{t.reason}"</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {handoffs.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Sequential Handoffs</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {handoffs.map((h, i) => (
                      <div key={i} style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                        <div style={{ color: TEXT, fontWeight: 500 }}>
                          <span style={{ color: "#15803d" }}>✓ {h.from} completed</span> → <span style={{ color: BRAND }}>{h.to} pending</span>
                          <span style={{ color: TEXT_FAINT, fontSize: 11, marginLeft: 8 }}>{new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </div>
                        {h.completionNote && <div style={{ color: "#065f46", marginTop: 2 }}>"{h.completionNote}"</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {totalPhotos > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Photos</div>
                  {photosBefore.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: "#b45309", fontWeight: 600, marginBottom: 4 }}>Before / Reference</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {photosBefore.map((src, i) => (
                          <img key={i} src={src} alt="" onClick={() => setLightbox({ src })} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}`, cursor: "zoom-in" }} />
                        ))}
                      </div>
                    </div>
                  )}
                  {photosAfter.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600, marginBottom: 4 }}>After / Completed</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {photosAfter.map((src, i) => (
                          <img key={i} src={src} alt="" onClick={() => setLightbox({ src })} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}`, cursor: "zoom-in" }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {est && (
                <div style={{ marginBottom: 12, background: "#fffbf2", border: "1px solid #fde68a", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>💰 Estimation: {formatINR(est.amount)}</div>
                  {est.notes && <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>{est.notes}</div>}
                  <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <ApprovalReadout title="Accounts" approved={est.accountsApproved} by={est.accountsBy} date={est.accountsDate} notes={est.accountsNotes} tint="#dbeafe" accent="#1d4ed8" />
                    <ApprovalReadout title="Admin"    approved={est.adminApproved}    by={est.adminBy}    date={est.adminDate}    notes={est.adminNotes}    tint="#ede9fe" accent="#6d28d9" />
                  </div>
                </div>
              )}
              {updates.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Job Updates ({updates.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {updates.slice().reverse().map((u, i) => (
                      <div key={i} style={{ background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: TEXT, fontWeight: 600 }}>{u.by || "—"}</span>
                          <span style={{ color: TEXT_FAINT, fontSize: 11 }}>{new Date(u.date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div style={{ color: "#334155", lineHeight: 1.45 }}>{u.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!history && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>Timeline</div>
                  <JobTimeline job={job} />
                </div>
              )}
              {!history && (
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: TEXT_MUTED }}>Move to:</span>
                  {STATUSES.filter(s => s !== job.status).map(s => {
                    const c = STATUS_COLORS[s];
                    return <button key={s} onClick={() => onStatusChange(s)} style={{ background: c.bg, color: c.text, border: "none", padding: "4px 12px", borderRadius: 100, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>{s}</button>;
                  })}
                </div>
              )}
            </div>
          )}
          {lightbox && (
            <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.9)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
              <img src={lightbox.src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
            </div>
          )}
        </div>
      );
    }

    function buildTimeline(job) {
      const out = [];
      const at = (d) => (d && d.length >= 10) ? d : (d || "");
      if (job.creationDate) out.push({ key: "created", iso: at(job.creationDate) + "T00:00:00Z", icon: "🆕", title: "Job created", detail: `Ticket ${job.ticketNumber || job.id} · Assigned to ${job.assignedTo}`, color: BRAND });
      if (job.startDate)    out.push({ key: "start",   iso: at(job.startDate)    + "T00:00:01Z", icon: "🚀", title: "Work started",  color: "#15803d" });
      (job.statusHistory || []).forEach((s, i) => out.push({ key: "status-" + i, iso: s.date, icon: s.to === "Completed" ? "✅" : s.to === "Hold" ? "⏸" : s.to === "Delayed" ? "⚠️" : "⚡", title: `Status changed: ${s.from} → ${s.to}`, color: STATUS_COLORS[s.to]?.dot || TEXT_MUTED }));
      (job.transfers || []).forEach((t, i) => out.push({ key: "tx-" + i, iso: t.date, icon: "↔", title: `Transferred: ${t.from} → ${t.to}`, detail: t.reason ? `"${t.reason}"` : null, color: "#6d28d9" }));
      (job.handoffs || []).forEach((h, i) => out.push({ key: "ho-" + i, iso: h.date, icon: "🤝", title: `${h.from} completed · handoff to ${h.to}`, detail: h.completionNote ? `"${h.completionNote}"` : null, color: "#0891b2" }));
      (job.jobUpdates || []).forEach((u, i) => out.push({ key: "upd-" + i, iso: u.date, icon: "📝", title: `Update by ${u.by || "—"}`, detail: u.note, color: "#0891b2" }));
      out.sort((a, b) => (a.iso || "").localeCompare(b.iso || ""));
      return out;
    }

    function JobTimeline({ job }) {
      const events = useMemo(() => buildTimeline(job), [job]);
      if (events.length === 0) return <div style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: "italic" }}>No timeline events yet</div>;
      return (
        <div style={{ position: "relative", paddingLeft: 22 }}>
          <div style={{ position: "absolute", left: 9, top: 6, bottom: 6, width: 2, background: BORDER }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map(e => (
              <div key={e.key} style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: -22, top: 2, width: 20, height: 20, borderRadius: "50%", background: SURFACE, border: `2px solid ${e.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>{e.icon}</div>
                <div style={{ fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: TEXT, fontWeight: 600 }}>{e.title}</span>
                    <span style={{ color: TEXT_FAINT, fontSize: 11 }}>{e.iso ? new Date(e.iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </div>
                  {e.detail && <div style={{ color: "#475569", marginTop: 2, lineHeight: 1.45 }}>{e.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    function ApprovalReadout({ title, approved, by, date, notes, tint, accent }) {
      return (
        <div style={{ background: tint + "55", border: `1px solid ${tint}`, borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: accent }}>{title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: approved ? "#15803d" : "#b45309" }}>{approved ? "✓ Approved" : "⏳ Pending"}</span>
          </div>
          {approved && (
            <div style={{ color: "#475569", lineHeight: 1.4 }}>
              <div>by <strong style={{ color: "#0f172a" }}>{by || "—"}</strong>{date && <span> · {date}</span>}</div>
              {notes && <div style={{ marginTop: 2, fontStyle: "italic" }}>"{notes}"</div>}
            </div>
          )}
        </div>
      );
    }

    function ModalShell({ title, subtitle, maxWidth = 580, onClose, children }) {
      useEffect(() => {
        function onKey(e) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [onClose]);
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, contain: "layout paint" }}
             onClick={e => e.target === e.currentTarget && onClose()}>
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, width: "100%", maxWidth, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(15,23,42,0.15)", transform: "translateZ(0)", contain: "layout paint" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: subtitle ? 6 : 22 }}>
              <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: TEXT }}>{title}</h3>
              <button className="btn-ghost" style={{ padding: "6px 10px" }} onClick={onClose}>✕</button>
            </div>
            {subtitle && <p style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 22 }}>{subtitle}</p>}
            {children}
          </div>
        </div>
      );
    }

    function MessageBox({ tone, children }) {
      const styles = tone === "error" ? { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c" } : { bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d" };
      return <div style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color, padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{children}</div>;
    }

    function SectionHeader({ icon, title, subtitle }) {
      return (
        <div style={{ marginTop: 8, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: subtitle ? 2 : 0 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>{title}</span>
          </div>
          {subtitle && <div style={{ fontSize: 12, color: TEXT_MUTED }}>{subtitle}</div>}
        </div>
      );
    }

    function ApprovalBlock({ title, approved, setApproved, by, setBy, date, setDate, notes, setNotes, teamMembers, tint, border, accent }) {
      return (
        <div style={{ background: tint, border: `1px solid ${border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 700, color: accent, fontSize: 13 }}>{title}</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", textTransform: "none", letterSpacing: 0, fontWeight: 600, color: approved ? "#15803d" : TEXT_MUTED, fontSize: 12, margin: 0 }}>
              <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#16a34a" }} />
              {approved ? "✓ Approved" : "Mark as approved"}
            </label>
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label>Approver</label>
              <select value={by} onChange={e => setBy(e.target.value)}>
                <option value="">— Select —</option>
                {sortAlpha(teamMembers).map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label>Comments</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Approval notes (optional)..." autoComplete="off" />
          </div>
        </div>
      );
    }

    function PhotoPicker({ label, photos, setPhotos, accent }) {
      const inputRef = useRef(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      async function onFiles(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setBusy(true); setError("");
        try {
          const compressed = await Promise.all(files.map(f => compressImage(f)));
          setPhotos(prev => [...prev, ...compressed]);
        } catch (err) {
          setError("Could not process one of the images. Please try a smaller photo.");
        } finally {
          setBusy(false);
          if (inputRef.current) inputRef.current.value = "";
        }
      }
      function removeAt(i) { setPhotos(prev => prev.filter((_, idx) => idx !== i)); }
      return (
        <div>
          <label style={{ color: accent }}>{label}</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position: "relative", width: 92, height: 92, borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}` }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button type="button" onClick={() => removeAt(i)} aria-label="Remove photo"
                        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(15,23,42,0.85)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                    style={{ width: 92, height: 92, border: `1.5px dashed ${BORDER}`, borderRadius: 8, background: SURFACE_ALT, color: TEXT_MUTED, cursor: busy ? "wait" : "pointer", fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <span style={{ fontSize: 22 }}>{busy ? "⏳" : "📷"}</span>
              {busy ? "Processing" : "Add Photo"}
            </button>
          </div>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple onChange={onFiles} style={{ display: "none" }} />
          {error && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>{error}</div>}
        </div>
      );
    }

    function uniqueStrings(jobs, field, maxLen, limit = 20) {
      const seen = new Set();
      const out = [];
      for (let i = (jobs || []).length - 1; i >= 0 && out.length < limit; i--) {
        const j = jobs[i];
        const v = (j[field] || "").trim();
        if (!v) continue;
        if (maxLen && v.length > maxLen) continue;
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k); out.push(v);
      }
      return out.sort();
    }

    function JobForm({ job, teamMembers, jobTypes, jobs, onSave, onClose, onManageTeam, onManageTypes }) {
      const titleRef = useRef(null), descRef = useRef(null), typeRef = useRef(null), categoryRef = useRef(null);
      const assignedRef = useRef(null), creationRef = useRef(null), startRef = useRef(null), endRef = useRef(null);
      const statusRef = useRef(null), remarkRef = useRef(null), reasonRef = useRef(null);
      const originalAssignee = job?.assignedTo;
      const [assigneeChanged, setAssigneeChanged] = useState(false);
      const [coWorkers, setCoWorkers] = useState(job?.additionalAssignees || []);
      const [primaryView, setPrimaryView] = useState(job?.assignedTo || teamMembers[0] || "");
      const [photosBefore, setPhotosBefore] = useState(job?.photos?.before || []);
      const [photosAfter,  setPhotosAfter]  = useState(job?.photos?.after || []);
      const [requiresEstimation, setRequiresEstimation] = useState(!!job?.estimation);
      const initialEst = job?.estimation || {};
      const [estAmount, setEstAmount] = useState(initialEst.amount ?? "");
      const [estNotes, setEstNotes]   = useState(initialEst.notes ?? "");
      const [accountsApproved, setAccountsApproved] = useState(!!initialEst.accountsApproved);
      const [accountsBy, setAccountsBy]       = useState(initialEst.accountsBy ?? "");
      const [accountsDate, setAccountsDate]   = useState(initialEst.accountsDate ?? "");
      const [accountsNotes, setAccountsNotes] = useState(initialEst.accountsNotes ?? "");
      const [adminApproved, setAdminApproved] = useState(!!initialEst.adminApproved);
      const [adminBy, setAdminBy]             = useState(initialEst.adminBy ?? "");
      const [adminDate, setAdminDate]         = useState(initialEst.adminDate ?? "");
      const [adminNotes, setAdminNotes]       = useState(initialEst.adminNotes ?? "");
      function toggleAccountsApproved(v) { setAccountsApproved(v); if (v && !accountsDate) setAccountsDate(today()); }
      function toggleAdminApproved(v)    { setAdminApproved(v);    if (v && !adminDate)    setAdminDate(today()); }
      const [jobUpdates, setJobUpdates] = useState(job?.jobUpdates || []);
      const newUpdateNoteRef = useRef(null);
      const [newUpdateBy, setNewUpdateBy] = useState(job?.assignedTo || teamMembers[0] || "");
      function addUpdate() {
        const note = newUpdateNoteRef.current?.value.trim();
        if (!note) { alert("Update note cannot be empty."); newUpdateNoteRef.current?.focus(); return; }
        setJobUpdates(prev => [...prev, { by: newUpdateBy || teamMembers[0] || "", note, date: new Date().toISOString() }]);
        if (newUpdateNoteRef.current) newUpdateNoteRef.current.value = "";
      }
      function removeUpdate(idx) {
        if (!confirm("Remove this update?")) return;
        setJobUpdates(prev => prev.filter((_, i) => i !== idx));
      }
      const titleSuggestions  = useMemo(() => uniqueStrings(jobs, "title"), []);          // eslint-disable-line
      const descSuggestions   = useMemo(() => uniqueStrings(jobs, "description", 80), []); // eslint-disable-line
      const remarkSuggestions = useMemo(() => uniqueStrings(jobs, "remark"), []);         // eslint-disable-line
      const availableCoMembers = useMemo(() => sortAlpha(teamMembers.filter(m => m !== primaryView && !coWorkers.includes(m))), [teamMembers, primaryView, coWorkers]);

      function onAssignedChange(e) {
        const v = e.target.value;
        setPrimaryView(v);
        setAssigneeChanged(!!job && v !== originalAssignee);
        setCoWorkers(prev => prev.filter(m => m !== v));
      }
      function addCoWorker(name) { if (!name) return; setCoWorkers(prev => prev.includes(name) ? prev : [...prev, name]); }
      function removeCoWorker(name) { setCoWorkers(prev => prev.filter(m => m !== name)); }

      function handleSave() {
        const title = titleRef.current.value.trim();
        if (!title) { alert("Job title is required"); titleRef.current.focus(); return; }
        const newAssignedTo = assignedRef.current.value;
        const isTransfer = !!job && newAssignedTo !== originalAssignee;
        const reason = reasonRef.current ? reasonRef.current.value.trim() : "";
        if (isTransfer && !reason) { alert("Please provide a reason for the transfer."); reasonRef.current?.focus(); return; }
        const data = {
          title, description: descRef.current.value.trim(), type: typeRef.current.value, category: categoryRef.current.value,
          assignedTo: newAssignedTo,
          additionalAssignees: coWorkers.filter(m => m !== newAssignedTo),
          creationDate: creationRef.current.value, startDate: startRef.current.value, endDate: endRef.current.value,
          status: statusRef.current.value, remark: remarkRef.current.value.trim(),
          transfers: job?.transfers || [],
          photos: { before: photosBefore, after: photosAfter },
          estimation: requiresEstimation ? {
            amount: Number(estAmount) || 0, notes: estNotes.trim(),
            accountsApproved, accountsBy, accountsDate, accountsNotes: accountsNotes.trim(),
            adminApproved, adminBy, adminDate, adminNotes: adminNotes.trim(),
          } : null,
          jobUpdates,
        };
        if (isTransfer) data.transfers = [...data.transfers, { from: originalAssignee, to: newAssignedTo, reason, date: new Date().toISOString() }];
        onSave(data);
      }

      return (
        <ModalShell onClose={onClose} title={job ? "Edit Job" : "New Job"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label>Job Title *</label>
              <input ref={titleRef} defaultValue={job?.title || ""} placeholder="e.g. Install Edison Pendants" list="rc-title-suggestions" autoComplete="off" />
              <datalist id="rc-title-suggestions">{titleSuggestions.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label>Description</label>
              <textarea ref={descRef} defaultValue={job?.description || ""} rows={3} placeholder="Detailed job description..." list="rc-desc-suggestions" />
              <datalist id="rc-desc-suggestions">{descSuggestions.map(d => <option key={d} value={d} />)}</datalist>
            </div>
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ margin: 0 }}>Job Type</label>
                  <button type="button" onClick={onManageTypes} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>+ Manage</button>
                </div>
                <select ref={typeRef} defaultValue={job?.type || sortAlpha(jobTypes)[0] || ""}>
                  {jobTypes.length === 0 && <option value="">No types — add some</option>}
                  {sortAlpha(jobTypes).map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>Category</label>
                <select ref={categoryRef} defaultValue={job?.category || "Medium"}>{JOB_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Primary Assignee</label>
                <button type="button" onClick={onManageTeam} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>+ Manage</button>
              </div>
              <select ref={assignedRef} defaultValue={job?.assignedTo || sortAlpha(teamMembers)[0] || ""} onChange={onAssignedChange}>
                {teamMembers.length === 0 && <option value="">No members</option>}
                {(() => {
                  const opts = new Set(teamMembers);
                  if (job?.assignedTo) opts.add(job.assignedTo);
                  return sortAlpha([...opts]).map(m => <option key={m}>{m}</option>);
                })()}
              </select>
            </div>
            {assigneeChanged && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 14 }}>
                <label style={{ color: "#9a3412" }}>↔ Transfer Reason * <span style={{ marginLeft: 6, color: "#c2410c", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>({originalAssignee} → {primaryView})</span></label>
                <input ref={reasonRef} placeholder="Why is this job being transferred?" autoFocus autoComplete="off" />
              </div>
            )}
            <div>
              <label>Co-workers (additional people on this job)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, minHeight: 6 }}>
                {coWorkers.length === 0 && <span style={{ fontSize: 12, color: TEXT_FAINT }}>None added</span>}
                {coWorkers.map(m => (
                  <span key={m} className="chip">
                    {m}
                    <button type="button" onClick={() => removeCoWorker(m)} aria-label={`Remove ${m}`}>✕</button>
                  </span>
                ))}
              </div>
              <select value="" onChange={e => { addCoWorker(e.target.value); e.target.value = ""; }} disabled={availableCoMembers.length === 0}>
                <option value="">{availableCoMembers.length === 0 ? "No more members to add" : "+ Add a co-worker..."}</option>
                {availableCoMembers.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div><label>Creation Date</label><input ref={creationRef} type="date" defaultValue={job?.creationDate || today()} /></div>
              <div><label>Start Date</label><input ref={startRef} type="date" defaultValue={job?.startDate || ""} /></div>
              <div><label>End Date</label><input ref={endRef} type="date" defaultValue={job?.endDate || ""} /></div>
            </div>
            <div>
              <label>Status</label>
              <select ref={statusRef} defaultValue={job?.status || "WIP"}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
            </div>
            <div>
              <label>Remark</label>
              <input ref={remarkRef} defaultValue={job?.remark || ""} placeholder="Any notes or updates..." list="rc-remark-suggestions" autoComplete="off" />
              <datalist id="rc-remark-suggestions">{remarkSuggestions.map(r => <option key={r} value={r} />)}</datalist>
            </div>
            <SectionHeader icon="📸" title="Photos" subtitle="Attach reference, brochure, before & after photos. Photos are compressed automatically." />
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <PhotoPicker label="Before / Reference" photos={photosBefore} setPhotos={setPhotosBefore} accent="#b45309" />
              <PhotoPicker label="After / Completed"  photos={photosAfter}  setPhotos={setPhotosAfter}  accent="#15803d" />
            </div>
            <SectionHeader icon="💰" title="Estimation" subtitle="Required when the job carries a budget that needs sign-off." />
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textTransform: "none", letterSpacing: 0, fontSize: 13, color: TEXT, fontWeight: 500, marginBottom: 0 }}>
              <input type="checkbox" checked={requiresEstimation} onChange={e => setRequiresEstimation(e.target.checked)} style={{ width: 16, height: 16, accentColor: BRAND }} />
              This job requires an estimation
            </label>
            {requiresEstimation && (
              <div style={{ background: "#fffbf2", border: "1px solid #fde68a", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                  <div><label>Estimated Amount (₹)</label><input type="number" min="0" step="1" value={estAmount} onChange={e => setEstAmount(e.target.value)} placeholder="e.g. 50000" inputMode="numeric" /></div>
                  <div><label>Estimation Notes</label><input value={estNotes} onChange={e => setEstNotes(e.target.value)} placeholder="Materials, labour breakdown, vendor..." autoComplete="off" /></div>
                </div>
                <ApprovalBlock title="Accounts Approval" approved={accountsApproved} setApproved={toggleAccountsApproved} by={accountsBy} setBy={setAccountsBy} date={accountsDate} setDate={setAccountsDate} notes={accountsNotes} setNotes={setAccountsNotes} teamMembers={teamMembers} tint="#dbeafe" border="#93c5fd" accent="#1d4ed8" />
                <ApprovalBlock title="Admin Approval"    approved={adminApproved}    setApproved={toggleAdminApproved}    by={adminBy}    setBy={setAdminBy}    date={adminDate}    setDate={setAdminDate}    notes={adminNotes}    setNotes={setAdminNotes}    teamMembers={teamMembers} tint="#ede9fe" border="#c4b5fd" accent="#6d28d9" />
              </div>
            )}
            <SectionHeader icon="📝" title="Job Updates" subtitle="The responsible person can log progress notes here. Each entry is timestamped." />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobUpdates.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {jobUpdates.map((u, i) => (
                    <div key={i} style={{ background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ color: TEXT, fontWeight: 600 }}>{u.by || "Unknown"}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: TEXT_FAINT, fontSize: 11 }}>{new Date(u.date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <button type="button" onClick={() => removeUpdate(i)} style={{ background: "none", border: "none", color: TEXT_FAINT, cursor: "pointer", padding: 0, fontSize: 12 }}>✕</button>
                        </div>
                      </div>
                      <div style={{ color: "#334155", lineHeight: 1.45 }}>{u.note}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 8, alignItems: "stretch" }}>
                <select value={newUpdateBy} onChange={e => setNewUpdateBy(e.target.value)}>
                  {teamMembers.length === 0 && <option value="">No members</option>}
                  {sortAlpha(teamMembers).map(m => <option key={m}>{m}</option>)}
                </select>
                <input ref={newUpdateNoteRef} placeholder="Add a progress note..." autoComplete="off" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addUpdate(); } }} />
                <button type="button" className="btn-primary" style={{ padding: "10px 14px", fontSize: 13, whiteSpace: "nowrap" }} onClick={addUpdate}>+ Add</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSave}>{job ? "Update Job" : "Create Job"}</button>
            </div>
          </div>
        </ModalShell>
      );
    }

    function TeamModal({ members, jobs, phones, getRoles, onAdd, onDelete, onSetPhone, onSetRole, onClose }) {
      const nameRef = useRef(null);
      const phoneRef = useRef(null);
      const [error, setError] = useState("");
      const [info, setInfo] = useState("");
      function handleAdd(e) {
        e?.preventDefault?.();
        setError(""); setInfo("");
        const name = nameRef.current.value;
        const phone = phoneRef.current ? phoneRef.current.value : "";
        const res = onAdd(name, phone);
        if (!res.ok) { setError(res.error); return; }
        setInfo(`Added "${name.trim()}"`);
        nameRef.current.value = "";
        if (phoneRef.current) phoneRef.current.value = "";
        nameRef.current.focus();
      }
      function handleDelete(name) {
        setError(""); setInfo("");
        const involved = jobs.filter(j => isAssigned(j, name)).length;
        const msg = involved > 0 ? `${name} is on ${involved} job${involved > 1 ? "s" : ""}. Deletion will be blocked. Continue?` : `Delete ${name} from the team?`;
        if (!confirm(msg)) return;
        const res = onDelete(name);
        if (!res.ok) { setError(res.error); return; }
        setInfo(`Removed "${name}"`);
      }
      return (
        <ModalShell onClose={onClose} title="Manage Team" subtitle="Names, phones, and roles. Roles control who can be picked as Requestor / Assignee / Approver across the app." maxWidth={680}>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr auto", gap: 8, marginBottom: 16 }}>
            <input ref={nameRef} placeholder="Name (e.g. Anjali)" autoFocus autoComplete="off" />
            <input ref={phoneRef} placeholder="WhatsApp e.g. 919876543210" autoComplete="off" inputMode="tel" />
            <button type="submit" className="btn-primary" style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>+ Add</button>
          </form>
          {error && <MessageBox tone="error">{error}</MessageBox>}
          {info  && <MessageBox tone="success">{info}</MessageBox>}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            {members.length === 0 && <div style={{ padding: 20, textAlign: "center", color: TEXT_MUTED, fontSize: 13 }}>No team members yet.</div>}
            {sortAlpha(members).map((m, i, arr) => (
              <TeamMemberRow key={m} name={m} phone={phones[m] || ""} roles={getRoles ? getRoles(m) : {}}
                jobCount={jobs.filter(j => isAssigned(j, m)).length} isLast={i === arr.length - 1} striped={i % 2 === 0}
                onSetPhone={onSetPhone} onSetRole={onSetRole} onDelete={() => handleDelete(m)} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </ModalShell>
      );
    }

    function TeamMemberRow({ name, phone, roles, jobCount, isLast, striped, onSetPhone, onSetRole, onDelete }) {
      const [editing, setEditing] = useState(false);
      const phoneEditRef = useRef(null);
      useEffect(() => { if (editing && phoneEditRef.current) { phoneEditRef.current.focus(); phoneEditRef.current.select?.(); } }, [editing]);
      function save() { onSetPhone(name, phoneEditRef.current?.value || ""); setEditing(false); }
      function cancel() { setEditing(false); }
      const ROLE_DEFS = [
        { key: "requestor",        label: "Requestor", icon: "📝", color: "#1d4ed8", bg: "#dbeafe" },
        { key: "assignee",         label: "Assignee",  icon: "🔧", color: "#15803d", bg: "#dcfce7" },
        { key: "accountsApprover", label: "Accounts",  icon: "💰", color: "#b45309", bg: "#fef3c7" },
        { key: "managerApprover",  label: "Manager",   icon: "👔", color: "#6d28d9", bg: "#ede9fe" },
      ];
      return (
        <div style={{ padding: "10px 14px", borderBottom: isLast ? "none" : `1px solid ${BORDER}`, background: striped ? SURFACE : SURFACE_ALT, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: BRAND_TINT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: BRAND, flexShrink: 0 }}>{name[0]?.toUpperCase()}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{name}</div>
                {editing ? (
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <input ref={phoneEditRef} defaultValue={phone} placeholder="e.g. 919876543210" inputMode="tel" autoComplete="off"
                           onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") cancel(); }}
                           style={{ padding: "4px 8px", fontSize: 12, height: 28 }} />
                    <button onClick={save} style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 6, padding: "0 10px", fontSize: 11, cursor: "pointer", height: 28 }}>Save</button>
                    <button onClick={cancel} className="btn-ghost" style={{ padding: "0 10px", fontSize: 11, height: 28 }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: TEXT_MUTED, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{jobCount} {jobCount === 1 ? "job" : "jobs"}</span>
                    <span style={{ color: TEXT_FAINT }}>·</span>
                    {phone ? <span style={{ color: "#15803d", fontFamily: "ui-monospace, monospace" }}>📱 +{phone}</span> : <span style={{ color: "#b45309" }}>⚠ No phone</span>}
                    <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 600 }}>{phone ? "Edit" : "+ Add phone"}</button>
                  </div>
                )}
              </div>
            </div>
            <button onClick={onDelete} disabled={jobCount > 0}
                    title={jobCount > 0 ? "Reassign their jobs first" : "Remove this member"}
                    style={{ background: jobCount > 0 ? SURFACE_ALT : "#fff", border: `1px solid ${jobCount > 0 ? BORDER : "#fecaca"}`, color: jobCount > 0 ? TEXT_FAINT : "#dc2626", padding: "6px 12px", borderRadius: 6, cursor: jobCount > 0 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500 }}>🗑 Delete</button>
          </div>
          {onSetRole && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginLeft: 40 }}>
              {ROLE_DEFS.map(rd => {
                const on = !!roles[rd.key];
                return (
                  <button key={rd.key} type="button" onClick={() => onSetRole(name, rd.key, !on)}
                          title={on ? `Remove ${rd.label} role` : `Grant ${rd.label} role`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, cursor: "pointer", background: on ? rd.bg : "transparent", color: on ? rd.color : TEXT_FAINT, border: `1px solid ${on ? rd.color + "44" : BORDER}` }}>
                    <span>{rd.icon}</span>{rd.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    function JobTypesModal({ types, jobs, onAdd, onDelete, onClose }) {
      const inputRef = useRef(null);
      const [error, setError] = useState("");
      const [info, setInfo] = useState("");
      function handleAdd(e) {
        e?.preventDefault?.();
        setError(""); setInfo("");
        const name = inputRef.current.value;
        const res = onAdd(name);
        if (!res.ok) { setError(res.error); return; }
        setInfo(`Added "${name.trim()}"`);
        inputRef.current.value = "";
        inputRef.current.focus();
      }
      function handleDelete(name) {
        setError(""); setInfo("");
        const used = jobs.filter(j => j.type === name).length;
        const msg = used > 0 ? `"${name}" is used by ${used} job${used > 1 ? "s" : ""}. Deletion will be blocked. Continue?` : `Delete the "${name}" job type?`;
        if (!confirm(msg)) return;
        const res = onDelete(name);
        if (!res.ok) { setError(res.error); return; }
        setInfo(`Removed "${name}"`);
      }
      return (
        <ModalShell onClose={onClose} title="Manage Job Types" subtitle="Add or remove job categories. Types in use cannot be deleted." maxWidth={480}>
          <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input ref={inputRef} placeholder="New job type (e.g. Plumbing)" autoFocus autoComplete="off" />
            <button type="submit" className="btn-primary" style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>+ Add</button>
          </form>
          {error && <MessageBox tone="error">{error}</MessageBox>}
          {info  && <MessageBox tone="success">{info}</MessageBox>}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            {types.length === 0 && <div style={{ padding: 20, textAlign: "center", color: TEXT_MUTED, fontSize: 13 }}>No job types yet.</div>}
            {sortAlpha(types).map((t, i, arr) => {
              const count = jobs.filter(j => j.type === t).length;
              return (
                <div key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${BORDER}`, background: i % 2 === 0 ? SURFACE : SURFACE_ALT }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: BRAND_TINT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏷</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{t}</div>
                      <div style={{ fontSize: 11, color: TEXT_MUTED }}>{count} {count === 1 ? "job" : "jobs"}</div>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(t)} disabled={count > 0}
                          title={count > 0 ? "Remove from those jobs first" : "Remove this type"}
                          style={{ background: count > 0 ? SURFACE_ALT : "#fff", border: `1px solid ${count > 0 ? BORDER : "#fecaca"}`, color: count > 0 ? TEXT_FAINT : "#dc2626", padding: "6px 12px", borderRadius: 6, cursor: count > 0 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500 }}>🗑 Delete</button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </ModalShell>
      );
    }

    function MaintenanceView({ requests, categories, teamMembers, memberPhones, membersBy, onCreate, onEdit, onDelete, onStatusChange, onAddUpdate, onResolve, onReopen, onSendAssignment, onSendReminder, onSubmitEstimate, onSetApproval, onSendWhatsApp, onManageCategories, onManageTeam }) {
      const [search, setSearch] = useState("");
      const [fCategory, setFCategory] = useState("All");
      const [fStatus, setFStatus] = useState("All");
      const [fAssignee, setFAssignee] = useState("All");
      const [expandedId, setExpandedId] = useState(null);

      const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return requests.filter(r => {
          if (fCategory !== "All" && r.category !== fCategory) return false;
          if (fStatus !== "All") {
            if (fStatus === "Delayed") { if (!isMaintDelayed(r)) return false; }
            else if (r.status !== fStatus) return false;
          }
          if (fAssignee !== "All" && r.assignedTo !== fAssignee) return false;
          if (q) {
            const hay = [r.ticketNumber, r.equipment, r.description, r.category, r.requestedBy, r.assignedTo, r.vendorName].filter(Boolean).join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        }).sort((a, b) => (b.requestedDate || "").localeCompare(a.requestedDate || ""));
      }, [requests, search, fCategory, fStatus, fAssignee]);

      const stats = useMemo(() => {
        const open = requests.filter(r => r.status === "Open").length;
        const inprog = requests.filter(r => r.status === "InProgress").length;
        const resolved = requests.filter(r => r.status === "Resolved").length;
        const delayed = requests.filter(isMaintDelayed).length;
        const totalSpent = requests.reduce((s, r) => s + (Number(r.amountSpent) || 0), 0);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonthSpent = requests.reduce((s, r) => {
          if (!r.resolvedDate) return s;
          const d = new Date(r.resolvedDate);
          return d >= monthStart ? s + (Number(r.amountSpent) || 0) : s;
        }, 0);
        const byCat = {};
        requests.forEach(r => {
          if (!r.category) return;
          if (!byCat[r.category]) byCat[r.category] = { count: 0, spent: 0, resolved: 0 };
          byCat[r.category].count += 1;
          byCat[r.category].spent += Number(r.amountSpent) || 0;
          if (r.status === "Resolved") byCat[r.category].resolved += 1;
        });
        const catRows = Object.entries(byCat).sort((a, b) => b[1].count - a[1].count);
        return { open, inprog, resolved, delayed, totalSpent, thisMonthSpent, catRows };
      }, [requests]);

      return (
        <div className="slide-in">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700 }}>🔧 Maintenance Tracker</h2>
              <p style={{ color: TEXT_MUTED, fontSize: 13, marginTop: 2 }}>Equipment & facility issue tracker — auto-assigned by category</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn-ghost" onClick={onManageCategories}>🗂 Categories</button>
              <button className="btn-primary" onClick={onCreate}>+ New Request</button>
            </div>
          </div>
          <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <div className="stat-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>Open + In-Progress</span>
                <span style={{ fontSize: 18 }}>🛠</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#1d4ed8", lineHeight: 1 }}>{stats.open + stats.inprog}</div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{stats.open} open · {stats.inprog} in progress</div>
            </div>
            <div className="stat-card" style={{ borderColor: stats.delayed > 0 ? "#fecaca" : BORDER, background: stats.delayed > 0 ? "#fef2f2" : SURFACE }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: stats.delayed > 0 ? "#b91c1c" : TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>Delayed</span>
                <span className={stats.delayed > 0 ? "pulse" : ""} style={{ fontSize: 18 }}>⚠️</span>
              </div>
              <div className={stats.delayed > 0 ? "pulse" : ""} style={{ fontSize: 26, fontWeight: 700, color: stats.delayed > 0 ? "#b91c1c" : TEXT_FAINT, lineHeight: 1 }}>{stats.delayed}</div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>past SLA days</div>
            </div>
            <div className="stat-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>Resolved</span>
                <span style={{ fontSize: 18 }}>✅</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#15803d", lineHeight: 1 }}>{stats.resolved}</div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>all-time</div>
            </div>
            <div className="stat-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>Spent This Month</span>
                <span style={{ fontSize: 18 }}>💰</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: BRAND, lineHeight: 1 }}>{formatINR(stats.thisMonthSpent)}</div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{formatINR(stats.totalSpent)} all-time</div>
            </div>
          </div>
          {stats.catRows.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 12, color: TEXT_MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>By Category</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 80px 80px 1fr", gap: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: TEXT_MUTED }}>Category</div>
                <div style={{ fontWeight: 600, color: TEXT_MUTED, textAlign: "right" }}>Requests</div>
                <div style={{ fontWeight: 600, color: TEXT_MUTED, textAlign: "right" }}>Resolved</div>
                <div style={{ fontWeight: 600, color: TEXT_MUTED, textAlign: "right" }}>Spent</div>
                {stats.catRows.map(([name, d]) => (
                  <React.Fragment key={name}>
                    <div style={{ color: TEXT, fontWeight: 500 }}>{name}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.count}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#15803d" }}>{d.resolved}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: BRAND, fontWeight: 600 }}>{formatINR(d.spent)}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search ticket / equipment / description..." autoComplete="off" />
            <select value={fCategory} onChange={e => setFCategory(e.target.value)}>
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c.name}>{c.name}</option>)}
            </select>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="All">All Status</option><option>Open</option><option>InProgress</option><option>Resolved</option>
              <option value="Delayed">⚠ Delayed only</option>
            </select>
            <select value={fAssignee} onChange={e => setFAssignee(e.target.value)}>
              <option value="All">All Assignees</option>
              {sortAlpha(teamMembers).map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6 }}>Showing <strong style={{ color: TEXT }}>{filtered.length}</strong> of {requests.length} request{requests.length !== 1 ? "s" : ""}</div>
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 48, color: TEXT_MUTED }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🛠</div>
              <div style={{ fontSize: 14 }}>{requests.length === 0 ? "No maintenance requests yet. Click + New Request to get started." : "No requests match these filters"}</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 10, background: SURFACE }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 920 }}>
                <thead>
                  <tr>
                    {["Ticket", "Equipment / Issue", "Category", "Requested By", "Assigned", "Status", "Age", "Spent", "Actions"].map((h, i) => (
                      <th key={i} style={{ padding: "10px 12px", textAlign: i >= 7 ? "right" : "left", borderBottom: `1px solid ${BORDER}`, background: SURFACE_ALT, fontWeight: 600, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: TEXT_MUTED, position: "sticky", top: 0, zIndex: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((req, idx) => {
                    const open = expandedId === req.id;
                    const delayed = isMaintDelayed(req);
                    const age = maintAgeDays(req);
                    const sc = MAINT_STATUS_COLORS[req.status] || MAINT_STATUS_COLORS.Open;
                    return (
                      <React.Fragment key={req.id}>
                        <tr onClick={() => setExpandedId(open ? null : req.id)} style={{ cursor: "pointer", background: open ? "#fff7ed" : (idx % 2 === 0 ? SURFACE : SURFACE_ALT), borderLeft: delayed ? "3px solid #ef4444" : "3px solid transparent" }}>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
                            <span className="badge" style={{ background: BRAND_TINT, color: BRAND, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{req.ticketNumber || "—"}</span>
                          </td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT }}>
                            <span style={{ marginRight: 6, color: TEXT_FAINT, fontSize: 10 }}>{open ? "▼" : "▶"}</span>
                            <span style={{ fontWeight: 500 }}>{req.equipment || "—"}</span>
                            {req.description && <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{req.description.slice(0, 60)}{req.description.length > 60 ? "..." : ""}</div>}
                          </td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT_MUTED }}>{req.category || "—"}</td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT_MUTED }}>{req.requestedBy || "—"}</td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT, fontWeight: 500 }}>{req.assignedTo || <span style={{ color: "#b45309" }}>Unassigned</span>}</td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
                            <span className="badge" style={{ background: sc.bg, color: sc.text }}><span className="dot" style={{ background: sc.dot }} />{sc.label}</span>
                            {delayed && <span className="badge pulse" style={{ marginLeft: 4, background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>⚠ Delayed</span>}
                            {req.estimate && (() => {
                              const a = req.estimate.accountsApproval || {};
                              const m = req.estimate.managerApproval || {};
                              const rejected = a.rejected || m.rejected;
                              const both = a.approved && m.approved;
                              const some = a.approved || m.approved;
                              if (rejected) return <div style={{ marginTop: 4 }}><span className="badge" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>✗ Rejected</span></div>;
                              if (both)     return <div style={{ marginTop: 4 }}><span className="badge" style={{ background: "#dcfce7", color: "#15803d", fontWeight: 700 }}>✓ Approved</span></div>;
                              if (some)     return <div style={{ marginTop: 4 }}><span className="badge" style={{ background: "#fef3c7", color: "#b45309", fontWeight: 600 }}>⏳ Partial</span></div>;
                              return <div style={{ marginTop: 4 }}><span className="badge" style={{ background: "#fef3c7", color: "#b45309", fontWeight: 600 }}>⏳ Pending</span></div>;
                            })()}
                          </td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, color: delayed ? "#dc2626" : TEXT_MUTED, fontWeight: delayed ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
                            <span className={delayed ? "pulse" : ""}>{age}d / {req.expectedDays}d</span>
                          </td>
                          <td style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, textAlign: "right", color: req.amountSpent ? BRAND : TEXT_FAINT, fontWeight: req.amountSpent ? 600 : 400 }}>{formatINR(req.amountSpent)}</td>
                          <td style={{ padding: "10px 8px", borderBottom: `1px solid ${BORDER}`, textAlign: "right", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                            {req.status !== "Resolved" && req.assignedTo && (
                              <>
                                <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#25d366", marginLeft: 2 }} onClick={() => onSendAssignment(req)} title="Send">📤</button>
                                <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: delayed ? "#dc2626" : "#b45309", marginLeft: 2 }} onClick={() => onSendReminder(req)} title="Reminder">🔔</button>
                              </>
                            )}
                            {req.status !== "Resolved" && <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#15803d", marginLeft: 2 }} onClick={() => onResolve(req)} title="Resolve">✅</button>}
                            {req.status === "Resolved" && <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#1d4ed8", marginLeft: 2 }} onClick={() => onReopen(req.id)} title="Re-open">↩</button>}
                            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, marginLeft: 2 }} onClick={() => onEdit(req)} title="Edit">✏️</button>
                            <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#dc2626", marginLeft: 2 }} onClick={() => onDelete(req.id)} title="Delete">🗑️</button>
                          </td>
                        </tr>
                        {open && (
                          <tr style={{ background: "#fffbf5" }}>
                            <td colSpan="9" style={{ padding: 18, borderBottom: `1px solid ${BORDER}` }}>
                              <MaintenanceDetails req={req} teamMembers={teamMembers} memberPhones={memberPhones} membersBy={membersBy}
                                onAddUpdate={(by, note) => onAddUpdate(req.id, by, note)} onStatusChange={(s) => onStatusChange(req.id, s)}
                                onSendAssignment={() => onSendAssignment(req)} onSendReminder={() => onSendReminder(req)}
                                onSubmitEstimate={(amount, jobDetails, by) => onSubmitEstimate(req.id, amount, jobDetails, by)}
                                onSetApproval={(which, payload) => onSetApproval(req.id, which, payload)}
                                onSendWhatsApp={onSendWhatsApp} onManageTeam={onManageTeam} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    function MaintenanceDetails({ req, teamMembers, memberPhones, membersBy, onAddUpdate, onStatusChange, onSendAssignment, onSendReminder, onSubmitEstimate, onSetApproval, onSendWhatsApp, onManageTeam }) {
      const [lightbox, setLightbox] = useState(null);
      const noteRef = useRef(null);
      const [updateBy, setUpdateBy] = useState(req.assignedTo || (teamMembers[0] || ""));
      const timing = maintTiming(req);

      function submitUpdate() {
        const note = noteRef.current?.value.trim();
        if (!note) { alert("Note required"); noteRef.current?.focus(); return; }
        onAddUpdate(updateBy || "—", note);
        if (noteRef.current) noteRef.current.value = "";
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>Issue Description</div>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{req.description || "—"}</div>
          </div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: TEXT_MUTED }}>
            <div>📅 Requested: <span style={{ color: TEXT }}>{(req.requestedDate || "").slice(0, 10)}</span></div>
            <div>👤 Requested by: <span style={{ color: TEXT }}>{req.requestedBy || "—"}</span></div>
            <div>👷 Assigned to: <span style={{ color: TEXT, fontWeight: 600 }}>{req.assignedTo || "—"}</span></div>
            <div>⏱ SLA: <span style={{ color: TEXT }}>{req.expectedDays}d</span></div>
            {req.status === "Resolved" && (<>
              <div>✅ Resolved: <span style={{ color: TEXT }}>{req.resolvedDate || "—"}</span></div>
              {req.vendorName && <div>🔧 Vendor: <span style={{ color: TEXT }}>{req.vendorName}</span></div>}
              {req.invoiceNumber && <div>🧾 Invoice #: <span style={{ color: TEXT, fontFamily: "ui-monospace, monospace" }}>{req.invoiceNumber}</span></div>}
              <div>💰 Amount: <strong style={{ color: BRAND }}>{formatINR(req.amountSpent)}</strong></div>
            </>)}
          </div>
          {timing && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: timing.kind === "early" ? "#dcfce7" : timing.kind === "ontime" ? "#dbeafe" : "#fee2e2", color: timing.kind === "early" ? "#15803d" : timing.kind === "ontime" ? "#1d4ed8" : "#b91c1c", fontWeight: 600, fontSize: 12 }}>
              {timing.kind === "early" ? `🏆 Resolved in ${timing.actual} day${timing.actual !== 1 ? "s" : ""} — ${timing.days} day${timing.days !== 1 ? "s" : ""} ahead of the ${timing.expected}-day SLA`
                : timing.kind === "ontime" ? `✓ Resolved exactly within the ${timing.expected}-day SLA`
                : `⚠ Took ${timing.actual} day${timing.actual !== 1 ? "s" : ""} — ${timing.days} day${timing.days !== 1 ? "s" : ""} past the ${timing.expected}-day SLA`}
            </div>
          )}
          {onSubmitEstimate && onSetApproval && (
            <EstimateApprovalSection req={req} membersBy={membersBy} teamMembers={teamMembers} memberPhones={memberPhones}
              onSubmitEstimate={onSubmitEstimate} onSetApproval={onSetApproval} onSendWhatsApp={onSendWhatsApp} onManageTeam={onManageTeam} />
          )}
          {req.photosBefore?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#b45309", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>📷 Issue Photos ({req.photosBefore.length})</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {req.photosBefore.map((src, i) => <img key={i} src={src} alt="" onClick={() => setLightbox({ src })} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}`, cursor: "zoom-in" }} />)}
              </div>
            </div>
          )}
          {req.photosAfter?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>✅ Resolution Photos ({req.photosAfter.length})</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {req.photosAfter.map((src, i) => <img key={i} src={src} alt="" onClick={() => setLightbox({ src })} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}`, cursor: "zoom-in" }} />)}
              </div>
            </div>
          )}
          {req.resolutionNote && <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#065f46" }}>💬 {req.resolutionNote}</div>}
          {req.invoicePhotos?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>🧾 Invoice ({req.invoicePhotos.length})</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {req.invoicePhotos.map((src, i) => <img key={i} src={src} alt="" onClick={() => setLightbox({ src })} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}`, cursor: "zoom-in" }} />)}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>Progress Updates ({(req.updates || []).length})</div>
            {(req.updates || []).length === 0
              ? <div style={{ fontSize: 12, color: TEXT_FAINT, fontStyle: "italic", marginBottom: 10 }}>No updates yet. The assigned person can add progress notes here.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {req.updates.slice().reverse().map((u, i) => (
                    <div key={i} style={{ background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ color: TEXT, fontWeight: 600 }}>{u.by || "—"}</span>
                        <span style={{ color: TEXT_FAINT, fontSize: 11 }}>{new Date(u.date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div style={{ color: "#334155", lineHeight: 1.45 }}>{u.note}</div>
                    </div>
                  ))}
                </div>
              )
            }
            {req.status !== "Resolved" && (
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 8 }}>
                <select value={updateBy} onChange={e => setUpdateBy(e.target.value)}>
                  {teamMembers.length === 0 && <option value="">No members</option>}
                  {sortAlpha(teamMembers).map(m => <option key={m}>{m}</option>)}
                </select>
                <input ref={noteRef} placeholder="Progress update — e.g. Called vendor, awaiting part..." autoComplete="off" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitUpdate(); } }} />
                <button type="button" className="btn-primary" style={{ padding: "10px 14px", fontSize: 13, whiteSpace: "nowrap" }} onClick={submitUpdate}>+ Add Update</button>
              </div>
            )}
          </div>
          {req.status !== "Resolved" && req.assignedTo && onSendAssignment && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>💬 Notify <strong style={{ color: TEXT }}>{req.assignedTo}</strong>
                {memberPhones[req.assignedTo] ? <span style={{ color: "#15803d", marginLeft: 6, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>+{memberPhones[req.assignedTo]}</span>
                  : <span style={{ color: "#b45309", marginLeft: 6, fontSize: 11 }}>(no phone — will prompt)</span>}
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={onSendAssignment} style={{ background: "#25d366", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📤 Send Assignment</button>
              <button onClick={onSendReminder} style={{ background: isMaintDelayed(req) ? "#dc2626" : "#f59e0b", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🔔 {isMaintDelayed(req) ? "Urgent Reminder" : "Send Reminder"}</button>
            </div>
          )}
          {req.status !== "Resolved" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED }}>Move status to:</span>
              {MAINT_STATUSES.filter(s => s !== req.status && s !== "Resolved").map(s => {
                const c = MAINT_STATUS_COLORS[s];
                return <button key={s} onClick={() => onStatusChange(s)} style={{ background: c.bg, color: c.text, border: "none", padding: "4px 12px", borderRadius: 100, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>{c.label}</button>;
              })}
            </div>
          )}
          {lightbox && (
            <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.9)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
              <img src={lightbox.src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
            </div>
          )}
        </div>
      );
    }

    function buildApprovalWhatsApp(req, which, isReminder) {
      const role = which === "accountsApproval" ? "Accounts" : "Manager";
      const est = req.estimate || {};
      let msg;
      if (isReminder) msg = `🔔 *REMINDER — ${role} Approval Pending*\n\n`;
      else            msg = `*Rolling Crunchy's Maintenance*\n*${role} Approval Requested*\n\n`;
      msg += `🎫 *${req.ticketNumber || req.id}*\n`;
      msg += `🔧 ${req.equipment || "—"}  ·  ${req.category || "—"}\n\n`;
      msg += `💰 Estimated Amount: *${formatINR(est.amount)}*\n`;
      if (est.jobDetails) msg += `📝 Job Scope:\n${est.jobDetails}\n\n`;
      msg += `Submitted by: ${est.submittedBy || "—"}`;
      if (est.submittedDate) msg += ` on ${(est.submittedDate || "").slice(0, 10)}`;
      msg += `\n\nPlease open the Maintenance Tracker, find ticket *${req.ticketNumber}* and approve or reject.`;
      if (isReminder) msg += `\n\n_This is a reminder — your approval is still pending._`;
      msg += `\n\n— ${role} approval ${isReminder ? "still pending" : "requested"}`;
      return msg;
    }

    function EstimateApprovalSection({ req, membersBy, teamMembers, memberPhones, onSubmitEstimate, onSetApproval, onSendWhatsApp, onManageTeam }) {
      const [adding, setAdding]   = useState(false);
      const [editing, setEditing] = useState(false);
      const amountRef = useRef(null);
      const detailsRef = useRef(null);
      const assigneeList = membersBy ? membersBy("assignee") : teamMembers;
      const [submittedBy, setSubmittedBy] = useState(req.assignedTo || (assigneeList[0] || ""));
      const est = req.estimate;
      const accApprovers = membersBy ? membersBy("accountsApprover") : teamMembers;
      const mgrApprovers = membersBy ? membersBy("managerApprover")  : teamMembers;
      function submit() {
        const res = onSubmitEstimate(amountRef.current?.value, detailsRef.current?.value, submittedBy);
        if (res?.ok === false) { alert(res.error); return; }
        setAdding(false); setEditing(false);
      }
      if (!est) {
        if (!adding) return (
          <div style={{ background: "#fffbf2", border: "1px dashed #fde68a", borderRadius: 10, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#92400e", marginBottom: 8, fontWeight: 600 }}>💰 No estimate submitted yet</div>
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 12 }}>The responsible person ({req.assignedTo || "assignee"}) should add an estimate and detail the job scope before work begins. The estimate then needs Accounts + Manager approval.</div>
            <button onClick={() => setAdding(true)} className="btn-primary" style={{ background: "#b45309" }}>💰 Add Estimate</button>
          </div>
        );
        return <EstimateFormBlock heading="Submit Estimate" req={req} amountRef={amountRef} detailsRef={detailsRef} assigneeList={assigneeList} submittedBy={submittedBy} setSubmittedBy={setSubmittedBy} onSubmit={submit} onCancel={() => setAdding(false)} defaults={{}} />;
      }
      const accApproval = est.accountsApproval || {};
      const mgrApproval = est.managerApproval  || {};
      if (editing) return <EstimateFormBlock heading="Edit Estimate (re-submits for approval)" req={req} amountRef={amountRef} detailsRef={detailsRef} assigneeList={assigneeList} submittedBy={submittedBy} setSubmittedBy={setSubmittedBy} onSubmit={submit} onCancel={() => setEditing(false)} defaults={{ amount: est.amount, jobDetails: est.jobDetails, submittedBy: est.submittedBy }} />;
      return (
        <div style={{ background: "#fffbf2", border: "1px solid #fde68a", borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>💰 Estimate: {formatINR(est.amount)}</div>
            <button onClick={() => setEditing(true)} className="btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}>✏️ Revise</button>
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}><strong style={{ color: TEXT }}>Job details:</strong> {est.jobDetails || "—"}</div>
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 12 }}>Submitted by <strong style={{ color: TEXT }}>{est.submittedBy || "—"}</strong>{est.submittedDate && <> on {(est.submittedDate || "").slice(0, 10)}</>}</div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ApprovalControl title="Accounts Approval" tint="#dbeafe" border="#93c5fd" accent="#1d4ed8" approverList={accApprovers} approval={accApproval} memberPhones={memberPhones}
              onApprove={(by, notes) => onSetApproval("accountsApproval", { approved: true,  rejected: false, by, date: today(), notes })}
              onReject ={(by, notes) => onSetApproval("accountsApproval", { approved: false, rejected: true,  by, date: today(), notes })}
              onClear  ={() => onSetApproval("accountsApproval", { approved: false, rejected: false, by: "", date: "", notes: "" })}
              onSendRequest ={(approver) => onSendWhatsApp(approver, buildApprovalWhatsApp(req, "accountsApproval", false), { logForReqId: req.id, logNote: `Accounts approval request sent to ${approver} via WhatsApp` })}
              onSendReminder={(approver) => onSendWhatsApp(approver, buildApprovalWhatsApp(req, "accountsApproval", true),  { logForReqId: req.id, logNote: `Accounts approval REMINDER sent to ${approver} via WhatsApp` })}
              onManageTeam={onManageTeam} />
            <ApprovalControl title="Manager Approval" tint="#ede9fe" border="#c4b5fd" accent="#6d28d9" approverList={mgrApprovers} approval={mgrApproval} memberPhones={memberPhones}
              onApprove={(by, notes) => onSetApproval("managerApproval", { approved: true,  rejected: false, by, date: today(), notes })}
              onReject ={(by, notes) => onSetApproval("managerApproval", { approved: false, rejected: true,  by, date: today(), notes })}
              onClear  ={() => onSetApproval("managerApproval", { approved: false, rejected: false, by: "", date: "", notes: "" })}
              onSendRequest ={(approver) => onSendWhatsApp(approver, buildApprovalWhatsApp(req, "managerApproval", false), { logForReqId: req.id, logNote: `Manager approval request sent to ${approver} via WhatsApp` })}
              onSendReminder={(approver) => onSendWhatsApp(approver, buildApprovalWhatsApp(req, "managerApproval", true),  { logForReqId: req.id, logNote: `Manager approval REMINDER sent to ${approver} via WhatsApp` })}
              onManageTeam={onManageTeam} />
          </div>
        </div>
      );
    }

    function EstimateFormBlock({ heading, req, amountRef, detailsRef, assigneeList, submittedBy, setSubmittedBy, onSubmit, onCancel, defaults }) {
      return (
        <div style={{ background: "#fffbf2", border: "1px solid #fde68a", borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, marginBottom: 10 }}>💰 {heading}</div>
          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, marginBottom: 10 }}>
            <div><label>Amount (₹)</label><input ref={amountRef} type="number" min="0" step="1" inputMode="numeric" defaultValue={defaults.amount ?? ""} placeholder="e.g. 15000" /></div>
            <div>
              <label>Submitted By</label>
              <select value={submittedBy} onChange={e => setSubmittedBy(e.target.value)}>
                {assigneeList.length === 0 && <option value="">No assignees configured</option>}
                {sortAlpha(assigneeList).map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Detailed Job Scope *</label>
            <textarea ref={detailsRef} rows={3} defaultValue={defaults.jobDetails || ""} placeholder="What needs to be done? Materials, labour, vendor, breakdown, etc." />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onCancel} className="btn-ghost">Cancel</button>
            <button onClick={onSubmit} className="btn-primary" style={{ background: "#b45309" }}>Submit for Approval</button>
          </div>
        </div>
      );
    }

    function ApprovalControl({ title, tint, border, accent, approverList, approval, memberPhones, onApprove, onReject, onClear, onSendRequest, onSendReminder, onManageTeam }) {
      const [mode, setMode] = useState(null);
      const [by, setBy] = useState(approval.by || (approverList[0] || ""));
      const [waApprover, setWaApprover] = useState(approverList[0] || "");
      const notesRef = useRef(null);
      useEffect(() => {
        if (!approval.by && approverList[0]) setBy(approverList[0]);
        if (!waApprover && approverList[0]) setWaApprover(approverList[0]);
      }, [approverList]); // eslint-disable-line
      function commit(handler) {
        if (!by) { alert(`Pick a ${title.toLowerCase().replace(" approval", "")} approver first.`); return; }
        handler(by, notesRef.current?.value || "");
        setMode(null);
      }
      function doSend(isReminder) {
        if (!waApprover) { alert(`Pick an approver to notify (grant ${title} role in Manage Team if the list is empty).`); return; }
        (isReminder ? onSendReminder : onSendRequest)(waApprover);
      }
      const state = approval.rejected ? "rejected" : approval.approved ? "approved" : "pending";
      const phones = memberPhones || {};
      return (
        <div style={{ background: tint + "66", border: `1px solid ${border}`, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontWeight: 700, color: accent, fontSize: 12 }}>{title}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: state === "approved" ? "#15803d" : state === "rejected" ? "#b91c1c" : "#b45309" }}>
              {state === "approved" ? "✓ Approved" : state === "rejected" ? "✗ Rejected" : "⏳ Pending"}
            </span>
          </div>
          {state !== "pending" && (
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
              by <strong style={{ color: "#0f172a" }}>{approval.by || "—"}</strong>{approval.date && <> · {approval.date}</>}
              {approval.notes && <div style={{ marginTop: 2, fontStyle: "italic" }}>"{approval.notes}"</div>}
            </div>
          )}
          {state === "pending" && onSendRequest && (
            <div style={{ background: "#ffffffaa", border: `1px dashed ${border}`, borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>📲 Notify Approver via WhatsApp</div>
              <select value={waApprover} onChange={e => setWaApprover(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", marginBottom: 6 }}>
                {approverList.length === 0 && <option value="">— No approvers configured —</option>}
                {sortAlpha(approverList).map(m => <option key={m} value={m}>{m}{phones[m] ? ` (+${phones[m]})` : " (no phone)"}</option>)}
              </select>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button onClick={() => doSend(false)} disabled={!waApprover} style={{ background: "#25d366", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: waApprover ? "pointer" : "not-allowed", opacity: waApprover ? 1 : 0.5 }}>📤 Send Request</button>
                <button onClick={() => doSend(true)} disabled={!waApprover}  style={{ background: "#f59e0b", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: waApprover ? "pointer" : "not-allowed", opacity: waApprover ? 1 : 0.5 }}>🔔 Reminder</button>
              </div>
            </div>
          )}
          {mode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Mark as {mode === "approve" ? "approved" : "rejected"} by:</div>
              <select value={by} onChange={e => setBy(e.target.value)} style={{ fontSize: 12, padding: "6px 8px" }}>
                {approverList.length === 0 && <option value="">— No approvers — assign role in Team master —</option>}
                {sortAlpha(approverList).map(m => <option key={m}>{m}</option>)}
              </select>
              <input ref={notesRef} placeholder={mode === "reject" ? "Reason for rejection (recommended)" : "Approval notes (optional)"} style={{ fontSize: 12, padding: "6px 8px" }} autoComplete="off" />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setMode(null)} className="btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}>Cancel</button>
                <button onClick={() => commit(mode === "approve" ? onApprove : onReject)} style={{ background: mode === "approve" ? "#16a34a" : "#dc2626", color: "#fff", border: "none", padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Confirm {mode === "approve" ? "Approve" : "Reject"}</button>
              </div>
              {approverList.length === 0 && <button onClick={onManageTeam} style={{ background: "none", border: "none", color: accent, cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 600, textAlign: "left", marginTop: 2 }}>→ Grant {title} role in Team master</button>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {state !== "approved" && <button onClick={() => setMode("approve")} style={{ background: "#16a34a", color: "#fff", border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Mark Approved</button>}
              {state !== "rejected" && <button onClick={() => setMode("reject")}  style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✗ Reject</button>}
              {state !== "pending"  && <button onClick={onClear} className="btn-ghost" style={{ padding: "5px 12px", fontSize: 11 }}>Reset</button>}
            </div>
          )}
        </div>
      );
    }

    function MaintenanceRequestForm({ request, categories, teamMembers, membersBy, onSave, onClose, onManageCategories, onManageTeam }) {
      const requestorList = membersBy ? membersBy("requestor") : teamMembers;
      const assigneeList  = membersBy ? membersBy("assignee")  : teamMembers;
      const equipmentRef = useRef(null);
      const descRef = useRef(null);
      const [category, setCategory] = useState(request?.category || (categories[0]?.name || ""));
      const [requestedBy, setRequestedBy] = useState(request?.requestedBy || (teamMembers[0] || ""));
      const [assignedTo, setAssignedTo]   = useState(request?.assignedTo  || "");
      const [photosBefore, setPhotosBefore] = useState(request?.photosBefore || []);
      const [photosAfter, setPhotosAfter]   = useState(request?.photosAfter || []);
      useEffect(() => {
        if (request) return;
        const cat = categories.find(c => c.name === category);
        if (cat?.defaultAssignee) setAssignedTo(cat.defaultAssignee);
      }, [category, categories, request]);
      const currentCat = categories.find(c => c.name === category);
      function handleSave() {
        const equipment = equipmentRef.current.value.trim();
        if (!equipment) { alert("Equipment / asset name is required."); equipmentRef.current.focus(); return; }
        if (!category)  { alert("Pick a category."); return; }
        onSave({ equipment, description: descRef.current.value.trim(), category, requestedBy, assignedTo, photosBefore, photosAfter });
      }
      return (
        <ModalShell onClose={onClose} title={request ? "Edit Maintenance Request" : "New Maintenance Request"} subtitle="Report an equipment issue or maintenance need. Will be auto-assigned based on category." maxWidth={600}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label>Equipment / Asset *</label><input ref={equipmentRef} defaultValue={request?.equipment || ""} placeholder="e.g. Dough Mixer #2, Walk-in Freezer, AC Unit (Kitchen)" autoFocus autoComplete="off" /></div>
            <div><label>Issue Description</label><textarea ref={descRef} defaultValue={request?.description || ""} rows={3} placeholder="What's wrong? What needs to be done?" /></div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Category *</label>
                <button type="button" onClick={onManageCategories} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>+ Manage</button>
              </div>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {categories.length === 0 && <option value="">No categories — please add some</option>}
                {categories.map(c => <option key={c.name} value={c.name}>{c.name} ({c.slaDays}d SLA{c.defaultAssignee ? ` → ${c.defaultAssignee}` : ", no default assignee"})</option>)}
              </select>
              {currentCat && <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>Expected resolution: <strong style={{ color: TEXT }}>{currentCat.slaDays} day{currentCat.slaDays !== 1 ? "s" : ""}</strong>{currentCat.defaultAssignee && <> · auto-assigns to <strong style={{ color: BRAND }}>{currentCat.defaultAssignee}</strong></>}</div>}
            </div>
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ margin: 0 }}>Requested By</label>
                  <button type="button" onClick={onManageTeam} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 10, fontWeight: 600, padding: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>📝 Roles</button>
                </div>
                <select value={requestedBy} onChange={e => setRequestedBy(e.target.value)}>
                  {requestorList.length === 0 && <option value="">No Requestor role assigned — set in Manage Team</option>}
                  {sortAlpha(requestorList).map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ margin: 0 }}>Assigned To</label>
                  <button type="button" onClick={onManageTeam} style={{ background: "none", border: "none", color: BRAND, cursor: "pointer", fontSize: 10, fontWeight: 600, padding: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>🔧 Roles</button>
                </div>
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {sortAlpha(assigneeList).map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <SectionHeader icon="📷" title="Photos" subtitle="Before-photos at request time; after-photos can be added as work progresses or at resolution." />
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <PhotoPicker label="Before / Issue" photos={photosBefore} setPhotos={setPhotosBefore} accent="#b45309" />
              <PhotoPicker label="After / In-Progress" photos={photosAfter} setPhotos={setPhotosAfter} accent="#15803d" />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSave}>{request ? "Update Request" : "Submit Request"}</button>
            </div>
          </div>
        </ModalShell>
      );
    }

    function MaintenanceCategoriesModal({ categories, requests, teamMembers, onUpsert, onDelete, onClose }) {
      const nameRef = useRef(null);
      const slaRef  = useRef(null);
      const [newAssignee, setNewAssignee] = useState("");
      const [error, setError] = useState("");
      const [info, setInfo]   = useState("");
      function handleAdd(e) {
        e?.preventDefault?.();
        setError(""); setInfo("");
        const name = nameRef.current.value;
        const res = onUpsert(null, { name, defaultAssignee: newAssignee, slaDays: slaRef.current.value });
        if (!res.ok) { setError(res.error); return; }
        setInfo(`Added "${name.trim()}"`);
        nameRef.current.value = ""; slaRef.current.value = ""; setNewAssignee("");
        nameRef.current.focus();
      }
      function handleDelete(name) {
        setError(""); setInfo("");
        const inUse = requests.filter(r => r.category === name).length;
        const msg = inUse > 0 ? `"${name}" is used by ${inUse} request${inUse > 1 ? "s" : ""}. Deletion blocked. Continue?` : `Delete category "${name}"?`;
        if (!confirm(msg)) return;
        const res = onDelete(name);
        if (!res.ok) { setError(res.error); return; }
        setInfo(`Removed "${name}"`);
      }
      return (
        <ModalShell onClose={onClose} title="Maintenance Categories" subtitle="Each category sets the default assignee for auto-routing + the expected days to resolve (SLA)." maxWidth={680}>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px auto", gap: 8, marginBottom: 16 }}>
            <input ref={nameRef} placeholder="Category name (e.g. Painting)" autoFocus autoComplete="off" />
            <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
              <option value="">— Default Assignee —</option>
              {sortAlpha(teamMembers).map(m => <option key={m}>{m}</option>)}
            </select>
            <input ref={slaRef} type="number" min="0" placeholder="SLA days" defaultValue="3" inputMode="numeric" />
            <button type="submit" className="btn-primary" style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>+ Add</button>
          </form>
          {error && <MessageBox tone="error">{error}</MessageBox>}
          {info && <MessageBox tone="success">{info}</MessageBox>}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            {categories.length === 0 && <div style={{ padding: 20, textAlign: "center", color: TEXT_MUTED, fontSize: 13 }}>No categories yet.</div>}
            {categories.map((c, i, arr) => (
              <CategoryRow key={c.name} category={c} teamMembers={teamMembers}
                requestCount={requests.filter(r => r.category === c.name).length}
                isLast={i === arr.length - 1} striped={i % 2 === 0}
                onSave={(next) => onUpsert(c.name, next)} onDelete={() => handleDelete(c.name)} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </ModalShell>
      );
    }

    function CategoryRow({ category, teamMembers, requestCount, isLast, striped, onSave, onDelete }) {
      const [editing, setEditing] = useState(false);
      const nameRef = useRef(null);
      const slaRef  = useRef(null);
      const [assignee, setAssignee] = useState(category.defaultAssignee || "");
      function save() {
        const res = onSave({ name: nameRef.current.value, defaultAssignee: assignee, slaDays: slaRef.current.value });
        if (res?.ok === false) { alert(res.error); return; }
        setEditing(false);
      }
      return (
        <div style={{ padding: "10px 14px", borderBottom: isLast ? "none" : `1px solid ${BORDER}`, background: striped ? SURFACE : SURFACE_ALT }}>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px auto auto", gap: 6, alignItems: "stretch" }}>
              <input ref={nameRef} defaultValue={category.name} />
              <select value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">— None —</option>
                {sortAlpha(teamMembers).map(m => <option key={m}>{m}</option>)}
              </select>
              <input ref={slaRef} type="number" min="0" defaultValue={category.slaDays} inputMode="numeric" />
              <button onClick={save} className="btn-primary" style={{ padding: "8px 14px", fontSize: 12 }}>Save</button>
              <button onClick={() => setEditing(false)} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 250 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: BRAND_TINT, display: "flex", alignItems: "center", justifyContent: "center" }}>🔧</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{category.name}</div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED }}>
                    SLA: <strong style={{ color: TEXT }}>{category.slaDays}d</strong>{" · "}Default: {category.defaultAssignee ? <strong style={{ color: BRAND }}>{category.defaultAssignee}</strong> : <span style={{ color: "#b45309" }}>none set</span>}{" · "}<span>{requestCount} request{requestCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditing(true)} className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }}>Edit</button>
                <button onClick={onDelete} disabled={requestCount > 0} title={requestCount > 0 ? "In use — cannot delete" : "Delete category"}
                        style={{ background: requestCount > 0 ? SURFACE_ALT : "#fff", border: `1px solid ${requestCount > 0 ? BORDER : "#fecaca"}`, color: requestCount > 0 ? TEXT_FAINT : "#dc2626", padding: "6px 12px", borderRadius: 6, cursor: requestCount > 0 ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500 }}>🗑 Delete</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    function ResolveMaintenanceModal({ request, onClose, onSubmit }) {
      const [photosAfter, setPhotosAfter] = useState(request.photosAfter || []);
      const [invoicePhotos, setInvoicePhotos] = useState(request.invoicePhotos || []);
      const noteRef   = useRef(null);
      const vendorRef = useRef(null);
      const invNoRef  = useRef(null);
      const amountRef = useRef(null);
      const resolvedDateRef = useRef(null);
      function submit() {
        const resolutionNote = noteRef.current.value.trim();
        if (!resolutionNote) { alert("Please describe what was done to resolve the issue."); noteRef.current.focus(); return; }
        onSubmit({
          photosAfter, invoicePhotos, resolutionNote,
          vendorName: (vendorRef.current.value || "").trim(),
          invoiceNumber: (invNoRef.current.value || "").trim(),
          amountSpent: Math.max(0, Number(amountRef.current.value) || 0),
          resolvedDate: resolvedDateRef.current.value || today(),
        });
      }
      return (
        <ModalShell onClose={onClose} title={`Resolve: ${request.ticketNumber || ""}`} subtitle={`${request.equipment} · Mark this maintenance request as resolved.`} maxWidth={620}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label>Resolution Note *</label><textarea ref={noteRef} defaultValue={request.resolutionNote || ""} rows={3} placeholder="What was done? E.g. Replaced compressor coil, called Cool-Tech Services..." autoFocus /></div>
            <PhotoPicker label="After / Resolution Photos" photos={photosAfter} setPhotos={setPhotosAfter} accent="#15803d" />
            <SectionHeader icon="🧾" title="Vendor & Invoice" subtitle="Record cost and supporting documents." />
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label>Vendor / Service Name</label><input ref={vendorRef} defaultValue={request.vendorName || ""} placeholder="e.g. Cool-Tech Services" autoComplete="off" /></div>
              <div><label>Invoice Number</label><input ref={invNoRef} defaultValue={request.invoiceNumber || ""} placeholder="e.g. CT-2026-0142" autoComplete="off" /></div>
              <div><label>Amount Spent (₹)</label><input ref={amountRef} type="number" min="0" step="1" defaultValue={request.amountSpent || 0} inputMode="numeric" /></div>
              <div><label>Resolved On</label><input ref={resolvedDateRef} type="date" defaultValue={request.resolvedDate || today()} /></div>
            </div>
            <PhotoPicker label="Invoice Photos" photos={invoicePhotos} setPhotos={setInvoicePhotos} accent="#64748b" />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" style={{ background: "#15803d" }} onClick={submit}>✓ Mark Resolved</button>
            </div>
          </div>
        </ModalShell>
      );
    }

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <App />;
}

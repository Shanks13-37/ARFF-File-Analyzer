import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Save,
  Settings,
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "arff_auth_token";
const PASSWORD_REQUIREMENTS =
  "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";

function passwordChecks(password) {
  const value = String(password || "");
  return [
    { label: "8+ characters", valid: value.length >= 8 },
    { label: "Uppercase letter", valid: /[A-Z]/.test(value) },
    { label: "Lowercase letter", valid: /[a-z]/.test(value) },
    { label: "Number", valid: /\d/.test(value) },
    { label: "Special character", valid: /[^A-Za-z0-9]/.test(value) }
  ];
}

function isStrongPassword(password) {
  return passwordChecks(password).every((check) => check.valid);
}

function isErrorMessage(message) {
  return /invalid|expired|incorrect|unavailable|must|match|required/i.test(message);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function DatasetHistory({ token, isAdmin = false, refreshKey = 0 }) {
  const [datasets, setDatasets] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/datasets`, { headers: authHeaders(token) })
      .then(parseJson)
      .then((data) => {
        setDatasets(data.datasets || []);
        setMessage("");
      })
      .catch((error) => {
        setDatasets([]);
        setMessage(error.message);
      });
  }, [token, refreshKey]);

  return (
    <div className="activitySection datasetSection">
      <div className="sectionTitle">
        <Database size={22} />
        <h2>{isAdmin ? "All Uploaded Datasets" : "My Uploaded Datasets"}</h2>
      </div>
      <div className="logTable datasetTable">
        <div className={`logHead datasetHead ${isAdmin ? "adminDataset" : ""}`}>
          <span>File</span>
          {isAdmin && <span>Owner</span>}
          <span>Result</span>
          <span>Size</span>
          <span>Time</span>
        </div>
        {message ? <p className="empty">{message}</p> : datasets.length === 0 ? (
          <p className="empty">No uploaded datasets yet.</p>
        ) : datasets.map((dataset) => (
          <div className={`logRow datasetRow ${isAdmin ? "adminDataset" : ""}`} key={dataset.id}>
            <span>{dataset.originalName}</span>
            {isAdmin && <span>{dataset.user ? `${dataset.user.name || dataset.user.email} (${dataset.user.id})` : "Unassigned legacy record"}</span>}
            <span className={dataset.valid ? "ok" : "bad"}>{dataset.valid ? "VALID" : "INVALID"}</span>
            <span>{formatBytes(dataset.fileSize)}</span>
            <span>{new Date(dataset.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ activePage, user, onLogout }) {
  const isAdmin = user?.role === "ADMIN";

  return (
    <nav className="nav">
      <a
        className="brand"
        href={isAdmin ? "/admin" : "/"}
        onClick={(event) => {
          event.preventDefault();
          navigate(isAdmin ? "/admin" : "/");
        }}
      >
        <Database size={22} />
        <span>ARFF File Analyzer</span>
      </a>
      <div className="navLinks">
        {user ? (
          <>
            <a
              className={activePage === "home" || activePage === "admin" ? "active" : ""}
              href={isAdmin ? "/admin" : "/"}
              onClick={(event) => {
                event.preventDefault();
                navigate(isAdmin ? "/admin" : "/");
              }}
            >
              {isAdmin ? "Admin" : "Upload"}
            </a>
            {!isAdmin && (
              <a
                className={activePage === "settings" ? "active" : ""}
                href="/settings"
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/settings");
                }}
              >
                Settings
              </a>
            )}
            <button className="iconButton" type="button" onClick={onLogout} aria-label="Log out" title="Log out">
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <>
            <a
              className={activePage === "login" ? "active" : ""}
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                navigate("/login");
              }}
            >
              Login
            </a>
            <a
              className={activePage === "register" ? "active" : ""}
              href="/register"
              onClick={(event) => {
                event.preventDefault();
                navigate("/register");
              }}
            >
              Register
            </a>
          </>
        )}
      </div>
    </nav>
  );
}

function BackgroundEffects() {
  return (
    <div className="backgroundEffects" aria-hidden="true">
      <div className="orbit orbitLarge" />
      <div className="orbit orbitMedium" />
      <div className="orbit orbitSmall">
        <div />
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="8" y1="20" x2="50" y2="50" />
        <line x1="92" y1="16" x2="50" y2="50" />
        <line x1="86" y1="82" x2="50" y2="50" />
        <line x1="14" y1="76" x2="50" y2="50" />
      </svg>
    </div>
  );
}

function AuthPanel({ mode, onAuthenticated }) {
  const isRegister = mode === "register";
  const [form, setForm] = useState({ name: "", email: "", organization: "", phoneNumber: "", password: "", confirmPassword: "" });
  const [setup, setSetup] = useState(null);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [phoneChallenge, setPhoneChallenge] = useState(null);
  const [phoneEnrollment, setPhoneEnrollment] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const showPasswordFeedback = isRegister && !setup && (form.password || form.confirmPassword);
  const passwordMatches = form.confirmPassword && form.password === form.confirmPassword;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (!isValidEmail(form.email)) {
        setMessage("Enter a valid email address.");
        return;
      }
      if (!form.password) {
        setMessage("Password is required.");
        return;
      }
      if (isRegister) {
        if (form.name.trim().length < 2) {
          setMessage("Enter your full name.");
          return;
        }
        if (!isStrongPassword(form.password)) {
          setMessage(PASSWORD_REQUIREMENTS);
          return;
        }
        if (form.password !== form.confirmPassword) {
          setMessage("Password and confirm password must match.");
          return;
        }
      }

      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const data = await parseJson(
        await fetch(`${API_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        })
      );

      if (data.setupRequired) {
        setSetup(data);
        setRequiresTwoFactor(false);
        setMessage(data.message);
        return;
      }

      if (data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setMessage(data.message);
        return;
      }

      if (data.requiresPhoneVerification) {
        setPhoneChallenge(data);
        setMessage("Enter the code sent to your phone.");
        return;
      }

      if (data.phoneEnrollmentRequired) {
        setPhoneEnrollment(data);
        setMessage(data.message);
        return;
      }

      onAuthenticated(data.token, data.user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitPhoneLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await parseJson(await fetch(`${API_URL}/api/auth/phone/verify-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneChallengeToken: phoneChallenge.phoneChallengeToken, code: form.token })
      }));
      onAuthenticated(data.token, data.user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitPhoneEnrollment(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await parseJson(await fetch(`${API_URL}/api/auth/phone/confirm-enrollment`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentToken: phoneEnrollment.enrollmentToken, code: form.token })
      }));
      onAuthenticated(data.token, data.user);
    } catch (error) { setMessage(error.message); } finally { setLoading(false); }
  }

  async function submitSetup(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const data = await parseJson(
        await fetch(`${API_URL}/api/auth/2fa/enable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupToken: setup.setupToken, token: form.token })
        })
      );
      onAuthenticated(data.token, data.user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="authPanel" onSubmit={phoneEnrollment ? submitPhoneEnrollment : phoneChallenge ? submitPhoneLogin : setup ? submitSetup : submit}>
      <div className="panelHeader">
        {isRegister ? <UserPlus size={22} /> : <LogIn size={22} />}
        <div>
          <h2>{phoneEnrollment || phoneChallenge ? "Verify Your Phone" : setup ? "Enable Two-Step Authentication" : isRegister ? "Create Account" : "Login"}</h2>
          <p>
            {phoneEnrollment || phoneChallenge
              ? `Enter the 6-digit SMS code sent to ${(phoneEnrollment || phoneChallenge).phoneNumber}.`
              : setup
              ? "Scan the QR code, then enter the 6-digit code."
              : isRegister
                ? "Register with your details before uploading datasets."
                : "Sign in with your email and password."}
          </p>
        </div>
      </div>

      {isRegister && !setup && (
        <>
          <label className="field">
            <span>Full name</span>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} />
          </label>
          <label className="field">
            <span>Organization</span>
            <input value={form.organization} onChange={(event) => updateField("organization", event.target.value)} />
          </label>
        </>
      )}

      {!setup && !phoneChallenge && !phoneEnrollment && (
        <>
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <PasswordInput value={form.password} onChange={(event) => updateField("password", event.target.value)} />
          </label>
          {isRegister && (
            <>
              <label className="field">
                <span>Phone number</span>
                <input placeholder="+919876543210" value={form.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} />
              </label>
              {showPasswordFeedback && (
                <PasswordFeedback password={form.password} confirmPassword={form.confirmPassword} matchLabel="Passwords match" />
              )}
              <label className="field">
                <span>Confirm password</span>
                <PasswordInput
                  value={form.confirmPassword}
                  onChange={(event) => updateField("confirmPassword", event.target.value)}
                  ariaInvalid={form.confirmPassword ? !passwordMatches : undefined}
                />
              </label>
            </>
          )}
        </>
      )}

      {(requiresTwoFactor || setup || phoneChallenge || phoneEnrollment) && (
        <label className="field">
          <span>{phoneChallenge || phoneEnrollment ? "SMS code" : "Authenticator code"}</span>
          <input inputMode="numeric" maxLength="6" value={form.token || ""} onChange={(event) => updateField("token", event.target.value)} />
        </label>
      )}

      {setup && (
        <div className="qrBox">
          <img src={setup.qrCode} alt="Two-step authentication QR code" />
          <p>Manual key: {setup.manualKey}</p>
        </div>
      )}

      {message && <div className={`result ${isErrorMessage(message) ? "failure" : "success"}`}>{message}</div>}

      <button type="submit" disabled={loading}>
        {isRegister ? <UserPlus size={18} /> : <ShieldCheck size={18} />}
        {loading ? "Please wait..." : phoneChallenge || phoneEnrollment || setup ? "Verify & Continue" : isRegister ? "Register & Continue" : "Login"}
      </button>

      {!setup && !phoneChallenge && !phoneEnrollment && (
        <div className="authSwitch">
          {isRegister ? (
            <>
              <span>Already have an account?</span>
              <button
                className="linkButton"
                type="button"
                onClick={() => {
                  setMessage("");
                  navigate("/login");
                }}
              >
                Login
              </button>
            </>
          ) : (
            <>
              <span>New user?</span>
              <button
                className="linkButton"
                type="button"
                onClick={() => {
                  setMessage("");
                  navigate("/register");
                }}
              >
                Create account
              </button>
            </>
          )}
        </div>
      )}
    </form>
  );
}

function PasswordFeedback({ password, confirmPassword, matchLabel }) {
  const checks = passwordChecks(password);
  const matchCheck = {
    label: matchLabel,
    valid: Boolean(confirmPassword) && password === confirmPassword
  };

  return (
    <div className="passwordFeedback" aria-live="polite">
      {[...checks, matchCheck].map((check) => (
        <span key={check.label} className={check.valid ? "valid" : "invalid"}>
          {check.valid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {check.label}
        </span>
      ))}
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder, ariaInvalid }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";

  return (
    <div className="passwordInput">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
      />
      <button className="passwordToggle" type="button" onClick={() => setVisible((current) => !current)} aria-label={label} title={label}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function UserAuthPage({ mode, onAuthenticated }) {
  return (
    <section className="hero loginHero">
      <BackgroundEffects />
      <Header activePage={mode} />
      <div className="loginGrid">
        <div className="heroCopy landingCopy">
          <div className="heroIcon">
            <FileUp size={42} />
          </div>
          <h1>{mode === "register" ? "Register to Analyze ARFF Files" : "Welcome Back"}</h1>
          <p className="projectByline">Account access workspace</p>
          <p>Use the same login page for user and admin accounts. The app routes you based on your stored role.</p>
          <div className="landingHighlights">
            <span>Role based routing</span>
            <span>ARFF validation</span>
            <span>Admin 2FA when needed</span>
          </div>
        </div>
        <AuthPanel mode={mode} onAuthenticated={onAuthenticated} />
      </div>
    </section>
  );
}

function UploadWorkspace({ token, user, onLogout }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const selectedFileStatus = useMemo(() => {
    if (!file) return null;
    return file.name.toLowerCase().endsWith(".arff") ? "valid" : "invalid";
  }, [file]);

  async function submitUpload(event) {
    event.preventDefault();
    if (!file) {
      setResult({ valid: false, error: "Please select a file first." });
      return;
    }

    setLoading(true);
    setResult(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch(`${API_URL}/api/uploads/arff`, {
        method: "POST",
        headers: authHeaders(token),
        body
      });
      const data = await response.json();
      setResult(data);
      setHistoryVersion((value) => value + 1);
    } catch {
      setResult({ valid: false, error: "Unable to reach the upload server." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="hero userDashboard">
      <BackgroundEffects />
      <Header activePage="home" user={user} onLogout={onLogout} />
      <div className="statusBadge">USER: {user.name || user.email}</div>

      <div className="heroStack">
        <div className="heroCopy">
          <div className="heroIcon">
            <FileUp size={42} />
          </div>
          <h1>File Upload & Validation</h1>
          <p className="projectByline">Signed-in user workspace</p>
          <p>Upload a dataset file, validate the ARFF structure, and keep the attempt linked to your account.</p>
        </div>

        <form className="uploadPanel" onSubmit={submitUpload}>
          <div className="panelHeader">
            <FileUp size={22} />
            <div>
              <h2>Upload ARFF File</h2>
              <p>Accepted format: .arff, max 10 MB</p>
            </div>
          </div>

          <label className="dropzone">
            <input type="file" accept=".arff" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <span>Choose file</span>
            <strong>{file ? file.name : "No file selected"}</strong>
          </label>

          {file && (
            <div className={`fileCheck ${selectedFileStatus}`}>
              {selectedFileStatus === "valid" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <span>
                {selectedFileStatus === "valid"
                  ? `Looks valid locally (${formatBytes(file.size)})`
                  : "Invalid extension selected"}
              </span>
            </div>
          )}

          <button type="submit" disabled={loading}>
            <ShieldCheck size={18} />
            {loading ? "Validating..." : "Validate Upload"}
          </button>

          {result && (
            <div className={`result ${result.valid ? "success" : "failure"}`}>
              {result.valid ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              <span>{result.message || result.error}</span>
            </div>
          )}
        </form>

      </div>
      <DatasetHistory token={token} refreshKey={historyVersion} />
    </section>
  );
}

function AdminDashboard({ token, user, onUserUpdated, onLogout, view = "admin" }) {
  const isAdmin = user.role === "ADMIN";
  const [logs, setLogs] = useState([]);
  const [logMessage, setLogMessage] = useState("");
  const [form, setForm] = useState({ email: user.email, currentPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [setup, setSetup] = useState(null);
  const [setupCode, setSetupCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneEnrollment, setPhoneEnrollment] = useState(null);
  const [phoneCode, setPhoneCode] = useState("");
  const showPasswordFeedback = Boolean(form.newPassword || form.confirmPassword);
  const newPasswordMatches = form.confirmPassword && form.newPassword === form.confirmPassword;

  async function loadLogs() {
    try {
      const data = await parseJson(await fetch(`${API_URL}/api/activity-logs`, { headers: authHeaders(token) }));
      setLogs(data.logs || []);
      setLogMessage("");
    } catch (error) {
      setLogs([]);
      setLogMessage(error.message);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveDetails(event) {
    event.preventDefault();
    setMessage("");
    setSetup(null);

    try {
      if (!isValidEmail(form.email)) {
        setMessage("Enter a valid email address.");
        return;
      }
      if (!form.currentPassword) {
        setMessage("Current password is required.");
        return;
      }
      if (form.newPassword) {
        if (!isStrongPassword(form.newPassword)) {
          setMessage(PASSWORD_REQUIREMENTS);
          return;
        }
        if (form.newPassword !== form.confirmPassword) {
          setMessage("New password and confirm password must match.");
          return;
        }
      }

      const data = await parseJson(
        await fetch(`${API_URL}${isAdmin ? "/api/admin/login-details" : "/api/account/login-details"}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(token)
          },
          body: JSON.stringify(form)
        })
      );
      onUserUpdated(data.user);
      setForm({ email: data.user.email, currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage(data.message);
      await loadLogs();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function resetTwoFactor() {
    setMessage("");
    try {
      const data = await parseJson(
        await fetch(`${API_URL}/api/admin/login-details`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(token)
          },
          body: JSON.stringify({ currentPassword: form.currentPassword, resetTwoFactor: true })
        })
      );
      setSetup(data);
      onUserUpdated(data.user);
      setMessage("Scan the new QR code and verify it before your next login.");
      await loadLogs();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function verifyResetTwoFactor(event) {
    event.preventDefault();
    try {
      const data = await parseJson(
        await fetch(`${API_URL}/api/auth/2fa/enable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupToken: setup.setupToken, token: setupCode })
        })
      );
      localStorage.setItem(TOKEN_KEY, data.token);
      onUserUpdated(data.user, data.token);
      setSetup(null);
      setSetupCode("");
      setMessage("Two-step authentication was updated.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function sendPhoneEnrollment() {
    setMessage("");
    try {
      const data = await parseJson(await fetch(`${API_URL}/api/auth/phone/send-enrollment`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(token) }, body: JSON.stringify({ phoneNumber })
      }));
      setPhoneEnrollment(data);
      setMessage(`SMS code sent to ${data.phoneNumber}.`);
    } catch (error) { setMessage(error.message); }
  }

  async function confirmPhoneEnrollment(event) {
    event.preventDefault();
    try {
      const data = await parseJson(await fetch(`${API_URL}/api/auth/phone/confirm-enrollment`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ enrollmentToken: phoneEnrollment.enrollmentToken, code: phoneCode })
      }));
      onUserUpdated(data.user);
      setPhoneEnrollment(null);
      setPhoneCode("");
      setMessage(data.message);
    } catch (error) { setMessage(error.message); }
  }

  const successCount = logs.filter((log) => log.status === "SUCCESS").length;
  const failureCount = logs.filter((log) => log.status === "FAILURE").length;
  const showSettings = view === "admin" || view === "settings";
  const showActivity = view === "admin" || view === "activity" || view === "settings";
  const adminPageCopy = {
    admin: {
      eyebrow: "Admin Center",
      title: "Administration Dashboard",
      description: "Manage admin security, review login activity, and inspect validation events separately from the user upload page."
    },
    activity: {
      eyebrow: isAdmin ? "Admin Activity" : "Account Activity",
      title: "Activity Logs",
      description: isAdmin
        ? "Review recent authentication, settings, upload, and validation events."
        : "Review your recent login, account settings, upload, and validation events."
    },
    settings: {
      eyebrow: isAdmin ? "Admin Settings" : "Account Settings",
      title: "Settings",
      description: isAdmin ? "Update admin login details and two-step authentication." : "Update your login email or password."
    }
  };
  const pageCopy = adminPageCopy[view] || adminPageCopy.admin;

  return (
    <section className="pageShell adminDashboard">
      <BackgroundEffects />
      <Header activePage={view} user={user} onLogout={onLogout} />

      <div className="activityIntro">
        <p className="eyebrow">{pageCopy.eyebrow}</p>
        <h1>{pageCopy.title}</h1>
        <p>{pageCopy.description}</p>
      </div>

      {showActivity && (
        <div className="metricGrid">
          <article>
            <Users size={22} />
            <span>{logs.length}</span>
            <p>Recent events</p>
          </article>
          <article>
            <CheckCircle2 size={22} />
            <span>{successCount}</span>
            <p>Successful events</p>
          </article>
          <article>
            <XCircle size={22} />
            <span>{failureCount}</span>
            <p>Failed events</p>
          </article>
        </div>
      )}

      {showSettings && (
      <div className="settingsGrid">
        <form className="settingsPanel" onSubmit={saveDetails}>
          <div className="panelHeader">
            <Settings size={22} />
            <div>
              <h2>{isAdmin ? "Admin Login Details" : "Login Details"}</h2>
              <p>{isAdmin ? "Update the admin email or password." : "Update your account email or password."}</p>
            </div>
          </div>

          <label className="field">
            <span>Email</span>
            <input value={form.email} onChange={(event) => updateField("email", event.target.value)} />
          </label>
          <label className="field">
            <span>Current password</span>
            <PasswordInput value={form.currentPassword} onChange={(event) => updateField("currentPassword", event.target.value)} />
          </label>
          <label className="field">
            <span>New password</span>
            <PasswordInput
              value={form.newPassword}
              onChange={(event) => updateField("newPassword", event.target.value)}
              placeholder="Leave blank to keep current password"
            />
          </label>
          {showPasswordFeedback && (
            <PasswordFeedback password={form.newPassword} confirmPassword={form.confirmPassword} matchLabel="New passwords match" />
          )}
          <label className="field">
            <span>Confirm new password</span>
            <PasswordInput
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
              placeholder="Repeat new password"
              ariaInvalid={form.confirmPassword ? !newPasswordMatches : undefined}
            />
          </label>

          {message && <div className={`result ${isErrorMessage(message) ? "failure" : "success"}`}>{message}</div>}

          <button type="submit">
            <Save size={18} />
            Save Login Details
          </button>
          {isAdmin && (
            <button className="secondaryButton" type="button" onClick={resetTwoFactor}>
              <KeyRound size={18} />
              Reset Two-Step Authentication
            </button>
          )}
        </form>

        <article className="settingsPanel">
          <div className="panelHeader">
            {isAdmin ? <Mail size={22} /> : <Users size={22} />}
            <div>
              <h2>{isAdmin ? "Admin Contact" : "Account Summary"}</h2>
              <p>{isAdmin ? "Project support mailbox." : "Your signed-in profile."}</p>
            </div>
          </div>
          <p className="contactEmail">{isAdmin ? "support@arff-analyzer.local" : user.email}</p>

          {!isAdmin && (
            <div className="twoFactorReset">
              <p>{user.phoneMfaEnabled ? `SMS two-step authentication enabled for ${user.phoneNumber}.` : "Add a phone number to enable SMS two-step authentication."}</p>
              {!phoneEnrollment ? <>
                <label className="field"><span>Phone number</span><input placeholder="+919876543210" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} /></label>
                <button type="button" onClick={sendPhoneEnrollment}>Send SMS Code</button>
              </> : (
                <form onSubmit={confirmPhoneEnrollment} className="twoFactorReset">
                  <label className="field"><span>SMS code</span><input inputMode="numeric" maxLength="6" value={phoneCode} onChange={(event) => setPhoneCode(event.target.value)} /></label>
                  <button type="submit">Verify Phone & Enable SMS 2FA</button>
                </form>
              )}
            </div>
          )}

          {setup && (
            <form className="twoFactorReset" onSubmit={verifyResetTwoFactor}>
              <div className="qrBox">
                <img src={setup.qrCode} alt="New two-step authentication QR code" />
                <p>Manual key: {setup.manualKey}</p>
              </div>
              <label className="field">
                <span>Authenticator code</span>
                <input inputMode="numeric" maxLength="6" value={setupCode} onChange={(event) => setSetupCode(event.target.value)} />
              </label>
              <button type="submit">
                <ShieldCheck size={18} />
                Verify New Code
              </button>
            </form>
          )}
        </article>
      </div>
      )}

      {showActivity && (
      <DatasetHistory token={token} isAdmin={isAdmin} />
      )}

      {showActivity && (
      <div className="activitySection">
        <div className="sectionTitle">
          <Activity size={22} />
          <h2>Activity Logs</h2>
        </div>
        <div className="logTable">
          <div className={`logHead ${isAdmin ? "adminLog" : ""}`}>
            <span>Status</span>
            <span>Action</span>
            {isAdmin && <span>User</span>}
            <span>IP</span>
            <span>Time</span>
          </div>
          {logMessage ? (
            <p className="empty">{logMessage}</p>
          ) : logs.length === 0 ? (
            <p className="empty">No activity yet.</p>
          ) : (
            logs.map((log) => (
              <div className={`logRow ${isAdmin ? "adminLog" : ""}`} key={log.id}>
                <span className={log.status === "SUCCESS" ? "ok" : "bad"}>{log.status}</span>
                <span>{log.action}</span>
                {isAdmin && <span>{log.user ? `${log.user.name || log.user.email} (${log.user.id})` : "System / unknown"}</span>}
                <span>{log.ipAddress || "Unknown"}</span>
                <span>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
      )}
    </section>
  );
}

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);

  useEffect(() => {
    function handlePathChange() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", handlePathChange);
    return () => window.removeEventListener("popstate", handlePathChange);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    fetch(`${API_URL}/api/auth/me`, { headers: authHeaders(token) })
      .then(parseJson)
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        navigate("/login");
      });
  }, [token]);

  function handleAuthenticated(nextToken, nextUser) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    navigate(nextUser.role === "ADMIN" ? "/admin" : "/");
  }

  function handleUserUpdated(nextUser, nextToken = token) {
    if (nextToken !== token) {
      localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
    }
    setUser(nextUser);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    navigate("/login");
  }

  if (!token || !user) {
    return (
      <main>
        <UserAuthPage mode={path === "/register" ? "register" : "login"} onAuthenticated={handleAuthenticated} />
      </main>
    );
  }

  if (user.role === "ADMIN") {
    const adminView = path === "/admin/activity" ? "activity" : "admin";

    return (
      <main>
        <AdminDashboard token={token} user={user} onUserUpdated={handleUserUpdated} onLogout={logout} view={adminView} />
        <footer>
          <strong>Admin</strong>
          <span>support@arff-analyzer.local</span>
          <span>Security settings and activity review</span>
        </footer>
      </main>
    );
  }

  if (path === "/activity" || path === "/settings") {
    const userView = path === "/activity" ? "activity" : "settings";

    return (
      <main>
        <AdminDashboard token={token} user={user} onUserUpdated={handleUserUpdated} onLogout={logout} view={userView} />
        <footer>
          <strong>Account</strong>
          <span>support@arff-analyzer.local</span>
          <span>User settings and activity review</span>
        </footer>
      </main>
    );
  }

  return (
    <main>
      <UploadWorkspace token={token} user={user} onLogout={logout} />
      <footer>
        <strong>Contact</strong>
        <span>support@arff-analyzer.local</span>
        <span>User uploads and ARFF validation</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

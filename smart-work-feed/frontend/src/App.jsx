import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "http://localhost:4000";

function Card({ children }) {
  return <div className="border rounded-xl p-4 bg-white shadow-sm">{children}</div>;
}

function Pill({ children }) {
  return <span className="text-xs px-2 py-1 rounded-full border bg-gray-50">{children}</span>;
}

async function trackEvent(payload) {
  try { await axios.post(`${API}/events`, payload); } catch {}
}

export default function App() {
  const [tab, setTab] = useState("worker"); // worker | company

  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);

  const [workerId, setWorkerId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companyJobId, setCompanyJobId] = useState("");

  const [feed, setFeed] = useState([]);
  const [candidates, setCandidates] = useState([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function loadBase() {
    const [u, j] = await Promise.all([axios.get(`${API}/users`), axios.get(`${API}/jobs`)]);
    setUsers(u.data.users || []);
    setJobs(j.data.jobs || []);
  }

  useEffect(() => { loadBase().catch(()=>{}); }, []);

  const workers = useMemo(() => users.filter(u => u.role === "worker"), [users]);
  const companies = useMemo(() => users.filter(u => u.role === "company"), [users]);
  const companyJobs = useMemo(
    () => jobs.filter(j => !companyId || String(j.company_id) === String(companyId)),
    [jobs, companyId]
  );

  useEffect(() => {
    if (!workerId && workers.length) setWorkerId(String(workers[0].id));
    if (!companyId && companies.length) setCompanyId(String(companies[0].id));
  }, [workers, companies]);

  useEffect(() => {
    if (!companyJobId && companyJobs.length) setCompanyJobId(String(companyJobs[0].id));
  }, [companyJobs, companyJobId]);

  async function refreshWorkerFeed() {
    if (!workerId) return;
    setErr(""); setLoading(true);
    try {
      const r = await axios.get(`${API}/feed/jobs?userId=${workerId}&limit=20`);
      setFeed(r.data.feed || []);

      // mark views for first few cards (MVP signal)
      const first = (r.data.feed || []).slice(0, 5);
      for (const it of first) {
        trackEvent({ actorType:"user", actorId:Number(workerId), targetType:"job", targetId:it.job.id, eventType:"view", dwellSeconds:0 });
      }
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshCandidates() {
    if (!companyJobId) return;
    setErr(""); setLoading(true);
    try {
      const r = await axios.get(`${API}/feed/candidates?jobId=${companyJobId}&limit=20`);
      setCandidates(r.data.candidates || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "worker") refreshWorkerFeed().catch(()=>{});
  }, [tab, workerId]);

  useEffect(() => {
    if (tab === "company") refreshCandidates().catch(()=>{});
  }, [tab, companyJobId]);

  async function workerAction(jobId, type) {
    if (!workerId) return;
    await trackEvent({ actorType:"user", actorId:Number(workerId), targetType:"job", targetId:jobId, eventType:type, dwellSeconds:0 });
    // remove card to simulate TikTok swipe
    setFeed(prev => prev.filter(x => x.job.id !== jobId));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-2xl font-bold">Smart Work Feed – MVP</div>
            <div className="text-sm text-gray-600">Amazon/TikTok-style recommendations for jobs & candidates</div>
          </div>

          <div className="flex gap-2">
            <button
              className={`px-3 py-2 rounded-lg border ${tab==="worker" ? "bg-black text-white" : "bg-white"}`}
              onClick={()=>setTab("worker")}
            >
              Worker
            </button>
            <button
              className={`px-3 py-2 rounded-lg border ${tab==="company" ? "bg-black text-white" : "bg-white"}`}
              onClick={()=>setTab("company")}
            >
              Company
            </button>
          </div>
        </div>

        {err ? (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>
        ) : null}

        {tab === "worker" ? (
          <>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <Card>
                <div className="font-semibold mb-2">Choose Worker</div>
                <select className="w-full border rounded-lg p-2" value={workerId} onChange={(e)=>setWorkerId(e.target.value)}>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name} — {w.location || "—"}</option>)}
                </select>
                <button className="w-full mt-3 border rounded-lg p-2 bg-white" disabled={loading} onClick={refreshWorkerFeed}>
                  {loading ? "..." : "Refresh Feed"}
                </button>
                <div className="text-xs text-gray-500 mt-2">
                  Actions (apply/save/skip) affect next recommendations.
                </div>
              </Card>

              <Card>
                <div className="font-semibold mb-2">How it feels</div>
                <div className="text-sm text-gray-700">
                  Each card is like TikTok: Apply/Save/Skip → system learns.
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill>Ranking</Pill><Pill>Trust</Pill><Pill>Exploration</Pill><Pill>AI Why</Pill>
                </div>
              </Card>

              <Card>
                <div className="font-semibold mb-2">Quick tips</div>
                <div className="text-sm text-gray-700">
                  Do 2–3 Apply on same type of job, then Refresh to see feed adapt.
                </div>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <div className="font-semibold mb-3">For You (Jobs Feed)</div>
                {!feed.length ? (
                  <div className="text-sm text-gray-600">No items. Add jobs then refresh.</div>
                ) : (
                  <div className="space-y-3">
                    {feed.map(item => (
                      <div key={item.job.id} className="border rounded-xl p-3 bg-gray-50">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold">{item.job.title}</div>
                            <div className="text-sm text-gray-700">{item.job.company_name} • {item.job.location || "—"} • {item.job.job_type}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold">{item.score}</div>
                            <div className="text-xs text-gray-600">score</div>
                          </div>
                        </div>

                        <div className="text-sm text-gray-700 mt-2">
                          <span className="font-medium">Why:</span> {item.why}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button className="px-3 py-2 rounded-lg bg-black text-white"
                            onClick={() => workerAction(item.job.id, "apply")}>Apply</button>
                          <button className="px-3 py-2 rounded-lg border bg-white"
                            onClick={() => workerAction(item.job.id, "save")}>Save</button>
                          <button className="px-3 py-2 rounded-lg border bg-white"
                            onClick={() => workerAction(item.job.id, "skip")}>Not Interested</button>
                          <button className="ml-auto px-3 py-2 rounded-lg border bg-white"
                            onClick={async ()=> {
                              await trackEvent({ actorType:"user", actorId:Number(workerId), targetType:"job", targetId:item.job.id, eventType:"click", dwellSeconds:0 });
                              alert(item.job.description);
                            }}>Details</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <div className="font-semibold mb-3">Jobs List (debug)</div>
                <div className="space-y-2 text-sm">
                  {jobs.map(j => (
                    <div key={j.id} className="border rounded-lg p-2 bg-white">
                      <div className="font-medium">{j.title} <span className="text-xs text-gray-500">#{j.id}</span></div>
                      <div className="text-xs text-gray-600">{j.company_name} • {j.location || "—"} • {j.job_type}</div>
                      <div className="text-xs text-gray-700 mt-1">Req: {j.required_skills}</div>
                    </div>
                  ))}
                  {!jobs.length ? <div className="text-gray-600">No jobs yet.</div> : null}
                </div>
              </Card>
            </div>
          </>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <Card>
                <div className="font-semibold mb-2">Choose Company</div>
                <select className="w-full border rounded-lg p-2" value={companyId} onChange={(e)=>setCompanyId(e.target.value)}>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name} — {c.location || "—"}</option>)}
                </select>

                <div className="font-semibold mt-4 mb-2">Choose Job</div>
                <select className="w-full border rounded-lg p-2" value={companyJobId} onChange={(e)=>setCompanyJobId(e.target.value)}>
                  {companyJobs.map(j => <option key={j.id} value={j.id}>{j.title} — {j.location || "—"}</option>)}
                </select>

                <button className="w-full mt-3 border rounded-lg p-2 bg-white" disabled={loading} onClick={refreshCandidates}>
                  {loading ? "..." : "Refresh Candidates"}
                </button>
              </Card>

              <Card>
                <div className="font-semibold mb-2">Top Candidates</div>
                <div className="text-sm text-gray-700">
                  “Amazon for hiring”: best candidates ranked by skills + location + availability + trust.
                </div>
              </Card>

              <Card>
                <div className="font-semibold mb-2">Actions</div>
                <div className="text-sm text-gray-700">
                  Invite/Reject are tracked as events for learning.
                </div>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <div className="font-semibold mb-3">Candidates Feed</div>
                {!candidates.length ? (
                  <div className="text-sm text-gray-600">No candidates. Add workers then refresh.</div>
                ) : (
                  <div className="space-y-3">
                    {candidates.map(c => (
                      <div key={c.worker.id} className="border rounded-xl p-3 bg-gray-50">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold">{c.worker.name}</div>
                            <div className="text-sm text-gray-700">{c.worker.location || "—"} • {c.worker.availability || "—"}</div>
                            <div className="text-xs text-gray-700 mt-1">Skills: {c.worker.skills}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold">{c.score}</div>
                            <div className="text-xs text-gray-600">score</div>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button className="px-3 py-2 rounded-lg bg-black text-white"
                            onClick={async ()=>{
                              await trackEvent({ actorType:"user", actorId:Number(companyId), targetType:"user", targetId:c.worker.id, eventType:"save", dwellSeconds:0 });
                              alert("Invited (event saved).");
                            }}>Invite</button>
                          <button className="px-3 py-2 rounded-lg border bg-white"
                            onClick={async ()=>{
                              await trackEvent({ actorType:"user", actorId:Number(companyId), targetType:"user", targetId:c.worker.id, eventType:"skip", dwellSeconds:0 });
                              setCandidates(prev => prev.filter(x => x.worker.id !== c.worker.id));
                            }}>Reject</button>
                          <button className="ml-auto px-3 py-2 rounded-lg border bg-white"
                            onClick={()=>alert(c.worker.experience || "No experience info.")}>Profile</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <div className="font-semibold mb-3">Workers List (debug)</div>
                <div className="space-y-2 text-sm">
                  {workers.map(w => (
                    <div key={w.id} className="border rounded-lg p-2 bg-white">
                      <div className="font-medium">{w.name} <span className="text-xs text-gray-500">#{w.id}</span></div>
                      <div className="text-xs text-gray-600">{w.location || "—"} • {w.availability || "—"}</div>
                      <div className="text-xs text-gray-700 mt-1">Skills: {w.skills}</div>
                    </div>
                  ))}
                  {!workers.length ? <div className="text-gray-600">No workers yet.</div> : null}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
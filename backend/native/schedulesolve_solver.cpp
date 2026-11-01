// ScheduleSolve native solver — AI-authored C++17 search core.
//
// Same algorithm as the Python reference (app/solver/home_solver.py):
// greedy descent (MRV + least-penalty), single/ejection hill-climbing,
// then branch-and-bound with an admissible lower bound. Domains, penalties,
// and option ordering are prepared in Python from the exact same code path
// CP-SAT uses, so the head-to-head compares search, not modeling.
//
// Protocol: one JSON object on stdin (indices only, no strings except keys),
// one JSON object on stdout:
//   {"status":"optimal|feasible|infeasible","objective":int|null,
//    "assignment":[option-index per section]|null,"nodes":n,
//    "timed_out":bool,"proven":bool}
//
// Deterministic: single thread, fixed ordering, no randomness.

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <iterator>
#include <string>
#include <tuple>
#include <unordered_map>
#include <utility>
#include <vector>

using namespace std;

// ---------------------------------------------------------------- mini JSON
struct Value {
    enum Type { Null, Bool, Int, Arr, Obj } type = Null;
    bool b = false;
    long long i = 0;
    vector<Value> arr;
    vector<pair<string, Value>> obj;
    const Value* get(const string& key) const {
        for (auto& kv : obj) if (kv.first == key) return &kv.second;
        return nullptr;
    }
};

struct Parser {
    const char* p;
    explicit Parser(const string& s) : p(s.c_str()) {}
    void ws() { while (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t') ++p; }
    Value parse() { ws(); return value(); }
    Value value() {
        ws();
        if (*p == '{') return object();
        if (*p == '[') return array();
        if (*p == '"') { str(); Value v; v.type = Value::Int; return v; } // keys only
        if (*p == 't') { p += 4; Value v; v.type = Value::Bool; v.b = true; return v; }
        if (*p == 'f') { p += 5; Value v; v.type = Value::Bool; return v; }
        if (*p == 'n') { p += 4; return Value(); }
        char* end = nullptr;
        Value v; v.type = Value::Int; v.i = strtoll(p, &end, 10); p = end; return v;
    }
    string str() {
        string out; ++p; // opening quote
        while (*p && *p != '"') {
            if (*p == '\\' && *(p + 1)) ++p;
            out += *p++;
        }
        if (*p == '"') ++p;
        return out;
    }
    Value object() {
        Value v; v.type = Value::Obj; ++p; ws();
        if (*p == '}') { ++p; return v; }
        while (true) {
            ws(); string key = str(); ws(); ++p; // ':'
            v.obj.emplace_back(key, value()); ws();
            if (*p == ',') { ++p; continue; }
            if (*p == '}') ++p;
            break;
        }
        return v;
    }
    Value array() {
        Value v; v.type = Value::Arr; ++p; ws();
        if (*p == ']') { ++p; return v; }
        while (true) {
            v.arr.push_back(value()); ws();
            if (*p == ',') { ++p; continue; }
            if (*p == ']') ++p;
            break;
        }
        return v;
    }
};

static long long getInt(const Value& v, const char* key, long long dflt = 0) {
    const Value* x = v.get(key);
    return x ? x->i : dflt;
}
static bool getBool(const Value& v, const char* key, bool dflt = false) {
    const Value* x = v.get(key);
    return x ? (x->type == Value::Bool ? x->b : x->i != 0) : dflt;
}

// ------------------------------------------------------------------- model
struct Opt {
    int i = -1, k = 0, r = -1, pen = 0, bld = -1;
    uint64_t mask = 0;   // bit (day*8+period)
    int days = 0;        // bitmask of days present in mask
};
struct Section {
    int course = -1;
    vector<int> cohorts;
    vector<Opt> opts;    // pre-sorted by (penalty, hint, i, k, r) in Python
    int lb = 0;
    long long weight = 0;  // student-credit load, x1000
};
struct PairInfo { int a, b; bool walk; };

static vector<Section> g_sections;
static vector<int> g_load_cap, g_prep_cap;
static vector<long long> g_sload_cap;   // student-credit load cap, x1000
static vector<PairInfo> g_pairs;
static vector<vector<pair<int, bool>>> g_partners;  // section -> (partner, walk?)
static vector<pair<int, int>> g_bound_pairs;        // sections that can contend
static vector<vector<int>> g_dist;          // building x building minutes
static int g_walk_limit = 10;
static int g_n_cohorts = 0;
static string g_objective = "preference";
static bool g_quick = false;

// ------------------------------------------------------------------- state
static vector<int> g_assign;                // section -> option index or -1
static vector<uint64_t> g_inst_mask, g_room_mask;
// instructor -> course -> number of assigned sections of that course.
// A fixed 64-bit mask silently aliases course ids >= 64 (the default
// institution has 201 courses), which produced false prep-cap conflicts and
// unbounded search. Prep tracking must stay exact at catalog scale.
static vector<unordered_map<int, int>> g_prep_counts;
static vector<int> g_inst_load;
static vector<long long> g_inst_weight; // student-credit load, x1000
static vector<vector<int>> g_cohort_day;    // [cohort][day]
static long long g_pen = 0;
static vector<int> g_best;
static long long g_best_obj = 0;
static bool g_have_best = false, g_timed_out = false;
static long long g_nodes = 0;
static chrono::steady_clock::time_point g_deadline;

static bool ok(int s, const Opt& o) {
    if (g_inst_mask[o.i] & o.mask) return false;
    if (g_room_mask[o.r] & o.mask) return false;
    if (g_inst_load[o.i] + 1 > g_load_cap[o.i]) return false;
    const Section& sec = g_sections[s];
    if (g_inst_weight[o.i] + sec.weight > g_sload_cap[o.i]) return false;
    const auto& preps = g_prep_counts[o.i];
    if (preps.find(sec.course) == preps.end()
        && (int)preps.size() + 1 > g_prep_cap[o.i]) return false;
    for (int c : sec.cohorts) {
        int d = o.days;
        while (d) { int day = __builtin_ctz(d); d &= d - 1;
            if (g_cohort_day[c][day] + 1 > 2) return false; }
    }
    for (auto& [other, walk] : g_partners[s]) {
        int oi = g_assign[other];
        if (oi < 0) continue;
        const Opt& oo = g_sections[other].opts[oi];
        if (o.mask & oo.mask) return false;
        // walk rule (C32): same-pattern back-to-back, buildings too far
        if (walk && abs(o.k - oo.k) == 1 &&
            g_dist[o.bld][oo.bld] > g_walk_limit) return false;
    }
    return true;
}

static void do_assign(int s, int oi) {
    const Opt& o = g_sections[s].opts[oi];
    g_assign[s] = oi;
    g_inst_mask[o.i] |= o.mask;
    g_room_mask[o.r] |= o.mask;
    g_inst_load[o.i]++;
    g_inst_weight[o.i] += g_sections[s].weight;
    g_prep_counts[o.i][g_sections[s].course]++;
    int d = o.days;
    for (int c : g_sections[s].cohorts) {
        int dd = d;
        while (dd) { int day = __builtin_ctz(dd); dd &= dd - 1; g_cohort_day[c][day]++; }
    }
    g_pen += o.pen;
}
static void do_unassign(int s, int oi) {
    const Opt& o = g_sections[s].opts[oi];
    g_assign[s] = -1;
    g_inst_mask[o.i] &= ~o.mask;
    g_room_mask[o.r] &= ~o.mask;
    g_inst_load[o.i]--;
    g_inst_weight[o.i] -= g_sections[s].weight;
    auto& preps = g_prep_counts[o.i];
    auto it = preps.find(g_sections[s].course);
    if (it != preps.end() && --it->second <= 0) preps.erase(it);
    int d = o.days;
    for (int c : g_sections[s].cohorts) {
        int dd = d;
        while (dd) { int day = __builtin_ctz(dd); dd &= dd - 1; g_cohort_day[c][day]--; }
    }
    g_pen -= o.pen;
}

static void restore(const vector<int>& snap) {
    fill(g_assign.begin(), g_assign.end(), -1);
    fill(g_inst_mask.begin(), g_inst_mask.end(), 0);
    fill(g_room_mask.begin(), g_room_mask.end(), 0);
    fill(g_inst_load.begin(), g_inst_load.end(), 0);
    fill(g_inst_weight.begin(), g_inst_weight.end(), 0);
    for (auto& preps : g_prep_counts) preps.clear();
    for (auto& row : g_cohort_day) fill(row.begin(), row.end(), 0);
    g_pen = 0;
    for (size_t s = 0; s < snap.size(); ++s) if (snap[s] >= 0) do_assign((int)s, snap[s]);
}

static vector<int> blockers(int s, const Opt& o) {
    vector<int> out;
    for (size_t t = 0; t < g_sections.size(); ++t) {
        if ((int)t == s || g_assign[t] < 0) continue;
        const Opt& oo = g_sections[t].opts[g_assign[t]];
        bool clash = (oo.i == o.i || oo.r == o.r) && (o.mask & oo.mask);
        bool pair_clash = false;
        if (!clash && (o.mask & oo.mask))
            for (auto& [p, w] : g_partners[s]) if (p == (int)t) pair_clash = true;
        if (clash || pair_clash) out.push_back((int)t);
    }
    return out;
}

static void improve() {
    if (!g_have_best || g_objective == "balanced_load") return;
    long long global_lb = 0;
    for (auto& sec : g_sections) global_lb += sec.lb;
    if (g_best_obj <= global_lb) return;  // incumbent is already provably optimal
    auto imp_deadline = min(g_deadline, chrono::steady_clock::now() + chrono::milliseconds(3000));
    restore(g_best);
    bool improved = true;
    while (improved && chrono::steady_clock::now() < imp_deadline) {
        improved = false;
        int n = (int)g_sections.size();
        for (int s = 0; s < n; ++s) {
            int cur = g_assign[s];
            int cur_pen = g_sections[s].opts[cur].pen;
            do_unassign(s, cur);
            int best_opt = cur, best_pen = cur_pen;
            for (size_t oi = 0; oi < g_sections[s].opts.size(); ++oi) {
                const Opt& o = g_sections[s].opts[oi];
                if (o.pen < best_pen && ok(s, o)) { best_opt = (int)oi; best_pen = o.pen; }
            }
            do_assign(s, best_opt);
            if (best_opt != cur) improved = true;
        }
        if (!improved) {
            for (int s = 0; s < n && !improved; ++s) {
                if (chrono::steady_clock::now() > imp_deadline) break;
                int cur_pen = g_sections[s].opts[g_assign[s]].pen;
                if (cur_pen <= g_sections[s].lb) continue;
                vector<int> snap = g_assign;
                for (size_t oi = 0; oi < g_sections[s].opts.size(); ++oi) {
                    const Opt& o = g_sections[s].opts[oi];
                    if (o.pen >= cur_pen) break;
                    vector<int> bl = blockers(s, o);
                    if (bl.size() != 1) continue;
                    int b = bl[0];
                    int b_pen = g_sections[b].opts[g_assign[b]].pen;
                    vector<int> partial = snap;
                    partial[s] = -1; partial[b] = -1;
                    restore(partial);
                    if (!ok(s, o)) { restore(snap); continue; }
                    do_assign(s, (int)oi);
                    bool placed = false;
                    for (size_t bi = 0; bi < g_sections[b].opts.size(); ++bi) {
                        const Opt& bo = g_sections[b].opts[bi];
                        if (bo.pen + o.pen < b_pen + cur_pen && ok(b, bo)) {
                            do_assign(b, (int)bi); placed = true; break;
                        }
                    }
                    if (placed) { improved = true; break; }
                    restore(snap);
                }
            }
        }
    }
    g_best = g_assign;
    g_best_obj = (g_objective == "balanced_load")
        ? *max_element(g_inst_weight.begin(), g_inst_weight.end()) : g_pen;
    restore(vector<int>(g_sections.size(), -1));
}

// Unit propagation: any unassigned section with exactly one viable option
// is forced; zero viable options is an immediate dead end. Assigned sections
// are recorded in `trail` so the caller can undo them.
static bool propagate(vector<int>& trail) {
    bool changed = true;
    while (changed) {
        changed = false;
        int n = (int)g_sections.size();
        for (int s = 0; s < n; ++s) {
            if (g_assign[s] >= 0) continue;
            int only = -1, cnt = 0;
            for (size_t oi = 0; oi < g_sections[s].opts.size() && cnt <= 1; ++oi)
                if (ok(s, g_sections[s].opts[oi])) { only = (int)oi; ++cnt; }
            if (cnt == 0) return false;
            if (cnt == 1) { do_assign(s, only); trail.push_back(s); changed = true; }
        }
    }
    return true;
}

static bool partner_walk(int s, int t, bool& walk) {
    for (auto& [p, w] : g_partners[s]) if (p == t) { walk = w; return true; }
    return false;
}

// Would options o (section s) and oo (section t) clash if both taken?
static bool opts_conflict(int s, const Opt& o, int t, const Opt& oo) {
    if (!(o.mask & oo.mask)) {
        bool w = false;
        if (partner_walk(s, t, w) && w && abs(o.k - oo.k) == 1 &&
            g_dist[o.bld][oo.bld] > g_walk_limit) return true;
        return false;
    }
    if (o.i == oo.i || o.r == oo.r) return true;
    bool w = false;
    return partner_walk(s, t, w);
}

// Returns true when the subtree is proven exhausted.
static bool dfs(bool first_only) {
    if (g_timed_out) return false;
    if ((++g_nodes % 256) == 0 && chrono::steady_clock::now() > g_deadline) {
        g_timed_out = true; return false;
    }
    int n = (int)g_sections.size();
    int assigned = 0;
    for (int a : g_assign) if (a >= 0) ++assigned;
    if (assigned == n) {
        long long obj = g_pen;
        if (g_objective == "balanced_load")
            obj = *max_element(g_inst_weight.begin(), g_inst_weight.end());
        if (!g_have_best || obj < g_best_obj) {
            g_best_obj = obj; g_best = g_assign; g_have_best = true;
        }
        return false;
    }
    // One pass over unassigned sections: live admissible bound (current +
    // cheapest currently-viable option per section) and MRV/regret choice.
    int chosen = -1;
    vector<int> chosen_opts;
    long long bound = g_pen;
    vector<int> live_min(n, 0);
    vector<Opt> live_argmin(n);
    vector<char> live_valid(n, 0);
    for (int s = 0; s < n; ++s) {
        if (g_assign[s] >= 0) continue;
        vector<int> viable;
        int best_pen = 1000000000;
        Opt argmin;
        for (size_t oi = 0; oi < g_sections[s].opts.size(); ++oi) {
            const Opt& o = g_sections[s].opts[oi];
            if (!ok(s, o)) continue;
            viable.push_back((int)oi);
            if (o.pen < best_pen) { best_pen = o.pen; argmin = o; }
        }
        if (viable.empty()) return true;  // dead end, fully explored
        bound += (g_objective == "balanced_load" ? 0 : best_pen);
        live_min[s] = best_pen; live_argmin[s] = argmin; live_valid[s] = 1;
        if (chosen < 0 || viable.size() < chosen_opts.size()) {
            chosen = s; chosen_opts = viable;
        }
    }
    if (chosen < 0) return true;
    if (g_have_best && g_objective != "balanced_load" && !first_only) {
        // Pairwise-conflict bound: for contending section pairs whose live
        // argmin options clash, at least one side must pay its deviation
        // cost. Summed over a disjoint matching, still admissible.
        vector<tuple<int, int, int>> extras;  // (extra, s, t)
        for (auto& [s, t] : g_bound_pairs) {
            if (!live_valid[s] || !live_valid[t]) continue;
            if (!opts_conflict(s, live_argmin[s], t, live_argmin[t])) continue;
            auto deviation = [&](int a, const Opt& against, int b) {
                int inc = 1000000000;
                for (auto& o : g_sections[a].opts)
                    if (ok(a, o) && !opts_conflict(a, o, b, against))
                        inc = min(inc, o.pen - live_min[a]);
                return inc;
            };
            int inc_s = deviation(s, live_argmin[t], t);
            int inc_t = deviation(t, live_argmin[s], s);
            int extra = min(inc_s, inc_t);
            if (extra > 0 && extra < 1000000000) extras.emplace_back(extra, s, t);
        }
        sort(extras.begin(), extras.end(),
             [](const auto& a, const auto& b) { return get<0>(a) > get<0>(b); });
        vector<char> used(n, 0);
        for (auto& [extra, s, t] : extras) {
            if (used[s] || used[t]) continue;
            used[s] = used[t] = 1;
            bound += extra;
            if (bound >= g_best_obj) break;
        }
    }
    if (chosen < 0) return true;
    if (g_have_best) {
        if (g_objective == "balanced_load") {
            if (*max_element(g_inst_weight.begin(), g_inst_weight.end()) >= g_best_obj) return false;
        } else if (bound >= g_best_obj) return false;
    }
    if (chosen < 0 || chosen_opts.empty()) return true;

    bool exhausted = true;
    long long global_lb = 0;
    for (auto& sec : g_sections) global_lb += sec.lb;
    for (int oi : chosen_opts) {
        vector<int> trail;
        do_assign(chosen, oi);
        bool alive = propagate(trail);
        if (alive && !dfs(first_only)) exhausted = false;
        for (int t = (int)trail.size() - 1; t >= 0; --t)
            do_unassign(trail[t], g_assign[trail[t]]);
        do_unassign(chosen, oi);
        if (first_only && g_have_best) return true;
        if (g_timed_out) return false;
        if (g_have_best && g_objective != "balanced_load" && g_best_obj <= global_lb) return true;
    }
    return exhausted;
}

int main() {
    string input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    Value root = Parser(input).parse();

    long long limit_ms = getInt(root, "time_limit_ms", 5000);
    g_quick = getBool(root, "quick", false);
    if (auto* o = root.get("objective")) (void)o;
    // objective arrives as int code: 0 preference, 1 room_fit (both additive), 2 balanced_load
    g_objective = getInt(root, "objective", 0) == 2 ? "balanced_load" : "preference";
    g_walk_limit = (int)getInt(root, "walk_limit", 10);

    const Value* secs = root.get("sections");
    const Value* insts = root.get("instructors");
    int n_inst = 0, n_room = (int)getInt(root, "n_rooms", 0);
    if (insts) {
        n_inst = (int)insts->arr.size();
        for (auto& iv : insts->arr) {
            g_load_cap.push_back((int)getInt(iv, "load"));
            g_prep_cap.push_back((int)getInt(iv, "prep"));
            g_sload_cap.push_back((long long)getInt(iv, "sload", 1000000000LL));
        }
    }
    if (secs) {
        for (auto& sv : secs->arr) {
            Section sec;
            sec.course = (int)getInt(sv, "course");
            sec.weight = (long long)getInt(sv, "weight", 0);
            if (auto* cs = sv.get("cohorts")) for (auto& c : cs->arr) sec.cohorts.push_back((int)c.i);
            if (auto* os = sv.get("options")) {
                for (auto& ov : os->arr) {
                    Opt o;
                    o.i = (int)getInt(ov, "i"); o.k = (int)getInt(ov, "k");
                    o.r = (int)getInt(ov, "r"); o.pen = (int)getInt(ov, "pen");
                    o.bld = (int)getInt(ov, "bld");
                    o.mask = (uint64_t)getInt(ov, "mask");
                    int dd = 0;
                    for (int day = 0; day < 5; ++day)
                        if (o.mask >> (day * 8) & 0xFFULL) dd |= (1 << day);
                    o.days = dd;
                    sec.opts.push_back(o);
                    sec.lb = sec.opts.size() == 1 ? o.pen : min(sec.lb, o.pen);
                }
            }
            g_sections.push_back(sec);
        }
    }
    g_n_cohorts = (int)getInt(root, "n_cohorts", 0);
    if (auto* ps = root.get("pairs")) {
        for (auto& pv : ps->arr) {
            PairInfo pr;
            pr.a = (int)getInt(pv, "a"); pr.b = (int)getInt(pv, "b");
            pr.walk = getBool(pv, "walk", false);
            g_pairs.push_back(pr);
        }
    }
    if (auto* ps = root.get("bound_pairs")) {
        for (auto& pv : ps->arr)
            g_bound_pairs.push_back({(int)getInt(pv, "a"), (int)getInt(pv, "b")});
    }
    if (auto* dm = root.get("dist")) {
        for (auto& row : dm->arr) {
            vector<int> r;
            for (auto& x : row.arr) r.push_back((int)x.i);
            g_dist.push_back(r);
        }
    }
    g_partners.assign(g_sections.size(), {});
    for (auto& pr : g_pairs) {
        g_partners[pr.a].push_back({pr.b, pr.walk});
        g_partners[pr.b].push_back({pr.a, pr.walk});
    }

    int n = (int)g_sections.size();
    g_assign.assign(n, -1);
    g_inst_mask.assign(n_inst, 0);
    g_room_mask.assign(max(n_room, 0), 0);
    g_prep_counts.assign(n_inst, {});
    g_inst_load.assign(n_inst, 0);
    g_inst_weight.assign(n_inst, 0);
    g_cohort_day.assign(g_n_cohorts, vector<int>(5, 0));
    g_deadline = chrono::steady_clock::now() + chrono::milliseconds(limit_ms);

    dfs(true);                    // greedy descent
    if (!g_quick) {
        improve();                // hill-climb the incumbent
        if (!g_timed_out) dfs(false);  // branch-and-bound: beat it or prove it
    }

    long long global_lb = 0;
    for (auto& sec : g_sections) global_lb += sec.lb;
    // A greedy-only run (quick) stops after the first descent; it can only
    // claim optimality when that incumbent already meets the admissible
    // lower bound. Never report "optimal" just because the search stopped
    // early by design.
    bool proven = g_have_best && (
        g_best_obj <= global_lb || (!g_quick && !g_timed_out));

    printf("{\"status\":\"%s\",\"objective\":%s,\"assignment\":%s,\"nodes\":%lld,\"timed_out\":%s,\"proven\":%s}",
           !g_have_best ? "infeasible" : (proven ? "optimal" : "feasible"),
           g_have_best ? to_string(g_best_obj).c_str() : "null",
           g_have_best ? [&] {
               string s = "[";
               for (int t = 0; t < n; ++t) { if (t) s += ","; s += to_string(g_best[t]); }
               return s + "]";
           }().c_str() : "null",
           g_nodes, g_timed_out ? "true" : "false", proven ? "true" : "false");
    return 0;
}

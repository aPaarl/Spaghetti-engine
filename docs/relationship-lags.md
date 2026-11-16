# Relationship time lags

Text for the next documentation release (Methodological Annex and User Manual). It describes the feature added in the `relationship-lags` branch.

## Methodological Annex: time lags between cause and effect

Standard fuzzy cognitive maps assume that every causal effect is passed on within one iteration. Many socio-ecological effects are slower than others: a subsidy changes farm practice within a season, while a change in farm practice reaches groundwater quality only after years. The Spaghetti Engine therefore allows a time lag on each relationship, following Park and Kim (1995) and Nair, Reckien and Van Maarseveen (2020).

A relationship from concept *j* to concept *i* with lag *L*<sub>ji</sub> passes on the value of *j* from *L*<sub>ji</sub> iterations earlier. Under the relative update rule, the update becomes

A<sub>i</sub>(t+1) = f( A<sub>i</sub>(t) + Σ<sub>j</sub> w<sub>ji</sub> · A<sub>j</sub>(t − L<sub>ji</sub>) ),

and under the absolute rule the term A<sub>i</sub>(t) is dropped as before. A lag of 0 is the ordinary update, so models without lags are unaffected. Lags are whole numbers of iterations from 0 to 10.

**State before the run.** Before iteration 0, the system is taken to have been at its starting state. A concept that is locked in a scenario (a driver) is treated as an intervention that starts at iteration 0. Before that, it stood at its own starting value from the model. A lagged relationship out of a driver therefore passes the intervention on *L* iterations later than an unlagged one would. In Transition Pathways, each stage starts from the equilibrium of the previous stage, with the new lever not yet applied.

**Equilibria.** At a fixed point every past state equals the present one, so lags do not change the fixed points of the update. A model that settles to a single equilibrium without lags reaches the same equilibrium with them. In the example peatland model, the largest difference was below 10<sup>−6</sup>. Lags change the path to equilibrium and the number of iterations needed. They can also make the model oscillate. When a model has several equilibria, they can also change which equilibrium is reached. In the example nexus model, a lag of one iteration on every relationship turns a settling baseline into a sustained oscillation. Nair et al. (2020) report changed steady states. Our formulation shows such changes only through these mechanisms, and users should check convergence when they add lags.

**Convergence.** With lags, the state of the system consists of the last *L*<sub>max</sub> + 1 iterations, where *L*<sub>max</sub> is the longest lag. A run is therefore counted as settled only when the largest change has remained below the convergence threshold for *L*<sub>max</sub> + 1 consecutive iterations. Without lags, this reduces to the usual single-iteration test.

**Effect on the analyses.**
- *Baseline Equilibrium and Scenarios & Simulation:* the convergence charts show when each effect arrives. The equilibria follow the rules above.
- *Influence Metrics and Influence Routes:* the structural measures are unchanged, because they are based on the network structure alone. Influence and sensitivity scores are taken from final states.
- *Sensitivity Analysis, Transition Point Analysis and Monte Carlo:* these analyses read final states. Lags change their results only through convergence, oscillation or the choice between equilibria. Monte Carlo varies weights and starting values, not lags.
- *Transition Pathways:* every stage settles fully before the next one starts. Lags therefore affect stage outcomes only through the same mechanisms.
- *Asynchronous mode:* a lagged relationship reads the recorded past state. An unlagged relationship reads the value already updated in the current sweep, as before.

**Interpretation of time.** An iteration has no calendar meaning in an FCM. A lag expresses the *relative* speed of an effect compared with the other relationships in the same model. Lags should be elicited as relative statements, for example "this effect takes about twice as long as most others". They should not be read as years or months.

**References**
- Park, K. S., & Kim, S. H. (1995). Fuzzy cognitive maps considering time relationships. *International Journal of Human-Computer Studies*, 42(2), 157–168.
- Nair, A., Reckien, D., & van Maarseveen, M. F. A. M. (2020). Generalised fuzzy cognitive maps: Considering the time dynamics between a cause and an effect. *Applied Soft Computing*, 92, 106309. https://doi.org/10.1016/j.asoc.2020.106309

## User Manual: giving a relationship a delay

With **Advanced tools** switched on, every relationship has a **Delay** setting. The setting appears in the Inspector on the Network tab (with − and + buttons) and in the relationship list of the Model editor. The delay is the number of extra iterations before a change in the source reaches the target. Leave it at 0 unless an effect is clearly slower than the others.

- A relationship with a delay shows it on the map, for example "+0.60 · lag 2".
- A delay that has been set remains visible when Advanced tools is off.
- Model files (JSON) save the delay as `lag`. The relationships table export (CSV and Excel) has a "Lag (iterations)" column. The analysis workbook adds a "Relationship Lags" sheet when the model has any delays.
- The "Method & diagnostics" panels report how many relationships have a delay and the longest delay.
- After adding delays, check on the Baseline Equilibrium tab that the model still settles.

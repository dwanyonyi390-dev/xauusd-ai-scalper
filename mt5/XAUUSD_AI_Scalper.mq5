// mt5/XAUUSD_AI_Scalper.mq5
// Phase 5 stub — Logger + Configuration + MarketData wired.
// RenderClient + strategy arrive in the next drop.

#property copyright "XAUUSD-AI-SCALPER"
#property version   "1.00"
#property strict

#include "Include/Logger.mqh"
#include "Include/Configuration.mqh"
#include "Include/MarketData.mqh"

// ─── Globals ────────────────────────────────────────────────────────────────
SResolvedSymbol  g_symbol;
CMarketData      g_market;
bool             g_initialised = false;
datetime         g_lastHeartbeat = 0;

// ─── OnInit ────────────────────────────────────────────────────────────────
int OnInit()
{
   Logger.Init(InpLogLevel, "EA", InpLogToFile);

   Logger.Info("OnInit: XAUUSD-AI-SCALPER v1.00 starting");

   // 1. Validate inputs that must not be empty
   if(StringLen(InpRenderBaseUrl) < 10)
   {
      Logger.Error("OnInit: InpRenderBaseUrl is not set");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringLen(InpAgentId) < 1 || StringLen(InpAgentSecret) < 16)
   {
      Logger.Error("OnInit: InpAgentId/InpAgentSecret missing or too short");
      return INIT_PARAMETERS_INCORRECT;
   }

   // 2. Resolve symbol on this broker
   if(!CConfiguration::ResolveSymbol(InpSymbol, g_symbol))
   {
      Logger.Error("OnInit: symbol resolution failed");
      return INIT_FAILED;
   }

   // 3. Account mode (hedging required)
   string reason = "";
   if(!CConfiguration::ValidateAccountMode(reason))
   {
      Logger.Error("OnInit: " + reason);
      return INIT_FAILED;
   }

   // 4. Market data
   g_market.Init(g_symbol);
   g_market.Update();
   Logger.Info("OnInit: initial bid=" + DoubleToString(g_market.Bid(), _Digits) +
               " ask=" + DoubleToString(g_market.Ask(), _Digits) +
               " spreadPts=" + DoubleToString(g_market.SpreadPoints(), 2));

   // 5. Timer for heartbeat + strategy (RenderClient in next drop)
   EventSetTimer(1);

   g_initialised = true;
   Logger.Info("OnInit: ready (trading enabled input=" + (InpTradingEnabled ? "true" : "false") + ")");
   return INIT_SUCCEEDED;
}

// ─── OnDeinit ──────────────────────────────────────────────────────────────
void OnDeinit(const int reason)
{
   EventKillTimer();
   Logger.Info("OnDeinit: reason=" + IntegerToString(reason));
   Logger.Shutdown();
   g_initialised = false;
}

// ─── OnTick ────────────────────────────────────────────────────────────────
void OnTick()
{
   if(!g_initialised) return;
   g_market.Update();
   // Strategy + position management will hook here in later phases.
}

// ─── OnTimer ───────────────────────────────────────────────────────────────
void OnTimer()
{
   if(!g_initialised) return;

   // Heartbeat every N seconds (RenderClient in next drop)
   datetime now = TimeCurrent();
   if(now - g_lastHeartbeat >= InpHeartbeatSeconds)
   {
      g_lastHeartbeat = now;
      g_market.Update();
      Logger.Info("heartbeat: bid=" + DoubleToString(g_market.Bid(), _Digits) +
                  " ask=" + DoubleToString(g_market.Ask(), _Digits) +
                  " spreadPts=" + DoubleToString(g_market.SpreadPoints(), 2) +
                  " tickAge=" + IntegerToString(g_market.TickAgeSeconds()) + "s");
   }
}
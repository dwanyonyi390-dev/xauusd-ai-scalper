// mt5/Include/Configuration.mqh
// EA inputs + broker symbol/broker validation. Called from OnInit.

#ifndef __CONFIGURATION_MQH__
#define __CONFIGURATION_MQH__

#property strict

#include "Logger.mqh"

// ─── EA Inputs (exposed in MT5 UI) ─────────────────────────────────────────
input string   InpRenderBaseUrl        = "https://xauusd-ai-scalper-api.onrender.com"; // Render API base URL
input string   InpAgentId              = "";                                            // MT5_AGENT_ID value
input string   InpAgentSecret          = "";                                            // MT5_AGENT_SECRET value
input int      InpHeartbeatSeconds     = 15;                                            // Heartbeat interval (seconds)

input string   InpSymbol               = "XAUUSD";                                      // Broker symbol for gold
input bool     InpTradingEnabled       = false;                                         // Enable strategy
input int      InpMaxPositions         = 4;                                             // Maximum simultaneous positions
input double   InpLotSize              = 0.01;                                          // Default lot size
input double   InpProfitTarget         = 0.50;                                          // Individual net profit target (USD)
input double   InpRiskPercent          = 0.5;                                           // Risk per position (percent)
input double   InpMaxDailyLossPercent  = 2.0;                                           // Max daily loss (percent)
input int      InpMaxConsecutiveLosses = 3;                                             // Stop after N consecutive losses
input int      InpMaxHoldSeconds       = 60;                                            // Max holding time target (seconds)
input double   InpMaxSpreadPoints      = 30;                                            // Max allowed spread in points

input ENUM_LOG_LEVEL InpLogLevel       = LOG_INFO;                                      // Log level
input bool     InpLogToFile            = true;                                          // Write log file (MQL5/Files)

// ─── Runtime struct (resolved after OnInit) ───────────────────────────────
struct SResolvedSymbol
{
   string          original;       
   string          broker;         
   double          point;          
   double          tickSize;       
   double          tickValue;      
   double          volumeMin;      
   double          volumeMax;      
   double          volumeStep;     
   int             stopsLevel;     
   int             freezeLevel;    
   ENUM_ORDER_TYPE_FILLING filling;
   long            tradeMode;
   long            executionMode;
   double          contractSize;
};

// ─── Configuration namespace-like struct ──────────────────────────────────
class CConfiguration
{
public:
   static bool ResolveSymbol(string requested, SResolvedSymbol &out)
   {
      out.original = requested;

      string candidates[];
      ArrayResize(candidates, 6);
      candidates[0] = requested;
      candidates[1] = "XAUUSD";
      candidates[2] = "GOLD";
      candidates[3] = "XAUUSDm";
      candidates[4] = "XAUUSD.c";
      candidates[5] = "GOLD.c";

      string chosen = "";
      for(int i = 0; i < ArraySize(candidates); i++)
      {
         if(SymbolSelect(candidates[i], true))
         {
            chosen = candidates[i];
            break;
         }
      }
      if(chosen == "")
      {
         Logger.Error("Configuration: no broker symbol matched requested '" + requested + "'");
         return false;
      }
      if(!SymbolInfoInteger(chosen, SYMBOL_SELECT))
      {
         if(!SymbolSelect(chosen, true))
         {
            Logger.Error("Configuration: SymbolSelect failed for '" + chosen + "'");
            return false;
         }
      }
      out.broker        = chosen;
      out.point         = SymbolInfoDouble(chosen, SYMBOL_POINT);
      out.tickSize      = SymbolInfoDouble(chosen, SYMBOL_TRADE_TICK_SIZE);
      out.tickValue     = SymbolInfoDouble(chosen, SYMBOL_TRADE_TICK_VALUE);
      out.volumeMin     = SymbolInfoDouble(chosen, SYMBOL_VOLUME_MIN);
      out.volumeMax     = SymbolInfoDouble(chosen, SYMBOL_VOLUME_MAX);
      out.volumeStep    = SymbolInfoDouble(chosen, SYMBOL_VOLUME_STEP);
      out.stopsLevel    = (int)SymbolInfoInteger(chosen, SYMBOL_TRADE_STOPS_LEVEL);
      out.freezeLevel   = (int)SymbolInfoInteger(chosen, SYMBOL_TRADE_FREEZE_LEVEL);
      out.filling       = (ENUM_ORDER_TYPE_FILLING)SymbolInfoInteger(chosen, SYMBOL_FILLING_MODE);
      out.tradeMode     = SymbolInfoInteger(chosen, SYMBOL_TRADE_MODE);
      out.executionMode = SymbolInfoInteger(chosen, SYMBOL_TRADE_EXEMODE);
      out.contractSize  = SymbolInfoDouble(chosen, SYMBOL_TRADE_CONTRACT_SIZE);

      if(out.point <= 0 || out.tickSize <= 0 || out.tickValue <= 0)
      {
         Logger.Error("Configuration: invalid tick/point metadata on '" + chosen + "'");
         return false;
      }
      if(out.volumeStep <= 0 || out.volumeMin <= 0)
      {
         Logger.Error("Configuration: invalid volume metadata on '" + chosen + "'");
         return false;
      }

      Logger.Info("Configuration: symbol resolved " + requested + " -> " + chosen +
                  " point=" + DoubleToString(out.point, 8) +
                  " tickValue=" + DoubleToString(out.tickValue, 8) +
                  " volMin=" + DoubleToString(out.volumeMin, 4) +
                  " volStep=" + DoubleToString(out.volumeStep, 4));
      return true;
   }

   static double NormalizeLot(double requested, const SResolvedSymbol &sym)
   {
      double v = MathFloor(requested / sym.volumeStep) * sym.volumeStep;
      if(v < sym.volumeMin) v = sym.volumeMin;
      if(v > sym.volumeMax) v = sym.volumeMax;
      return NormalizeDouble(v, 4);
   }

   static bool ValidateAccountMode(string &reason)
   {
      ENUM_ACCOUNT_MARGIN_MODE mode = (ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE);
      if(mode != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      {
         reason = "Account is not in hedging mode. Independent positions require ACCOUNT_MARGIN_MODE_RETAIL_HEDGING.";
         return false;
      }
      if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
      {
         reason = "ACCOUNT_TRADE_ALLOWED is false (terminal option or broker restriction).";
         return false;
      }
      return true;
   }
};

#endif // __CONFIGURATION_MQH__
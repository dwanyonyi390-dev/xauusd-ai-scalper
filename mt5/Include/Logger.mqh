// mt5/Include/Logger.mqh
// Logging helper: writes to Experts tab and to a rolling file.
// Native MQL5 implementation (no varargs).

#ifndef __LOGGER_MQH__
#define __LOGGER_MQH__

#property strict

// ─── Log levels ─────────────────────────────────────────────────────────────
enum ENUM_LOG_LEVEL
{
   LOG_DEBUG = 0,
   LOG_INFO  = 1,
   LOG_WARN  = 2,
   LOG_ERROR = 3,
   LOG_FATAL = 4,
};

// ─── Logger namespace-like struct ───────────────────────────────────────────
class CLogger
{
private:
   ENUM_LOG_LEVEL m_minLevel;
   string         m_prefix;
   string         m_filePath;
   int            m_fileHandle;
   bool           m_fileEnabled;

   string LevelName(ENUM_LOG_LEVEL lvl)
   {
      switch(lvl)
      {
         case LOG_DEBUG: return "DEBUG";
         case LOG_INFO:  return "INFO";
         case LOG_WARN:  return "WARN";
         case LOG_ERROR: return "ERROR";
         case LOG_FATAL: return "FATAL";
      }
      return "?????";
   }

   string Timestamp()
   {
      datetime now = TimeLocal();
      MqlDateTime dt;
      TimeToStruct(now, dt);
      return StringFormat("%04d-%02d-%02d %02d:%02d:%02d",
                          dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
   }

   void Write(ENUM_LOG_LEVEL lvl, string message)
   {
      if(lvl < m_minLevel) return;

      string line = "[" + Timestamp() + "] [" + LevelName(lvl) + "] [" + m_prefix + "] " + message;

      // Terminal output (Experts tab)
      Print(line);

      // File output
      if(m_fileEnabled && m_fileHandle != INVALID_HANDLE)
      {
         FileWriteString(m_fileHandle, line + "\r\n");
         FileFlush(m_fileHandle);
      }
   }

public:
   CLogger() : m_minLevel(LOG_INFO), m_prefix("EA"), m_filePath(""), m_fileHandle(INVALID_HANDLE), m_fileEnabled(false) {}

   void Init(ENUM_LOG_LEVEL minLevel, string prefix, bool enableFile, string fileName = "XAUUSD_AI_Scalper.log")
   {
      m_minLevel = minLevel;
      m_prefix   = prefix;
      m_fileEnabled = enableFile;
      if(enableFile)
      {
         m_filePath = fileName;
         m_fileHandle = FileOpen(m_filePath, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI);
         if(m_fileHandle == INVALID_HANDLE)
         {
            PrintFormat("[%s] WARN: Logger file open failed for %s (err=%d). File logging disabled.",
                        m_prefix, m_filePath, GetLastError());
            m_fileEnabled = false;
         }
         else
         {
            FileSeek(m_fileHandle, 0, SEEK_END);
         }
      }
      Info("Logger initialised (file=" + (enableFile ? "on" : "off") + ")");
   }

   void Shutdown()
   {
      if(m_fileHandle != INVALID_HANDLE)
      {
         FileClose(m_fileHandle);
         m_fileHandle = INVALID_HANDLE;
      }
   }

   void SetMinLevel(ENUM_LOG_LEVEL lvl) { m_minLevel = lvl; }

   // ─── Native MQL5 overloads (no varargs) ──────────────────────────────────
   void Debug(string msg)  { Write(LOG_DEBUG, msg); }
   void Info(string msg)   { Write(LOG_INFO,  msg); }
   void Warn(string msg)   { Write(LOG_WARN,  msg); }
   void Error(string msg)  { Write(LOG_ERROR, msg); }
   void Fatal(string msg)  { Write(LOG_FATAL, msg); }

   // Multi-arg variants for structured fields
   void Info2(string tag, string v1) { Write(LOG_INFO, tag + "=" + v1); }
   void Info3(string tag, string v1, string v2) { Write(LOG_INFO, tag + "=" + v1 + " " + v2); }
   void Warn2(string tag, string v1) { Write(LOG_WARN, tag + "=" + v1); }
   void Error2(string tag, string v1) { Write(LOG_ERROR, tag + "=" + v1); }
};

// ─── Global instance ────────────────────────────────────────────────────────
CLogger Logger;

// ─── Short macros so call sites stay terse ──────────────────────────────────
#define LOG_DEBUG(msg) Logger.Debug(msg)
#define LOG_INFO(msg)  Logger.Info(msg)
#define LOG_WARN(msg)  Logger.Warn(msg)
#define LOG_ERROR(msg) Logger.Error(msg)
#define LOG_FATAL(msg) Logger.Fatal(msg)

#endif // __LOGGER_MQH__
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;

// One-shot headless package setup. Universal-2D already brings URP 2D + 2D Animation/Sprite/Tilemap.
// Run:    Unity -batchmode -quit -executeMethod GodzillaSetup.SetupPackages.Run     (core pkgs)
// MCP:    Unity -batchmode -quit -executeMethod GodzillaSetup.SetupPackages.AddMcp  (OpenUPM Unity-MCP)
//
// Cinemachine PINNED @3.1.4 (verified current LTS-line for Unity 6, June 2026; 3.1.5 is a bugfix-only bump).
// Class names in 3.1.x: CinemachineCamera / CinemachinePositionComposer / CinemachineConfiner2D /
// CinemachineBasicMultiChannelPerlin (run the phase1-prep-spec Step-3a grep before writing IsoCameraRig.cs).
// MCP primary = CoplayDev/unity-mcp (stable, full L1/L2/L3, Claude-Code-proven, June 2026); IvanMurzak is the
// modular alternative; Unity's OFFICIAL AI Assistant MCP is still pre-release (~Q3 2026 — revisit then).
// VERIFY the exact OpenUPM package id + latest version at install time (these ship weekly); ensure the OpenUPM
// scoped registry is present (skeleton's manifest-scopedRegistries.json). See docs/campaign/gate-closure/G0-*.
namespace GodzillaSetup {
  public static class SetupPackages {
    static readonly string[] Core = { "com.unity.inputsystem", "com.unity.cinemachine@3.1.4", "com.unity.test-framework" };
    public static void Run()    { Add(Core); }
    // CoplayDev primary (verify id 'com.coplaydev.unity-mcp' on OpenUPM at install); IvanMurzak alt: 'com.ivanmurzak.unity.mcp'.
    public static void AddMcp() { Add(new[] { "com.coplaydev.unity-mcp" }); }
    static void Add(string[] pkgs) {
      Debug.Log("[GodzillaSetup] adding: " + string.Join(", ", pkgs));
      var req = Client.AddAndRemove(pkgs, null);
      while (!req.IsCompleted) System.Threading.Thread.Sleep(150);
      if (req.Status == StatusCode.Failure) {
        Debug.LogError("[GodzillaSetup] FAILED: " + (req.Error != null ? req.Error.message : "?"));
        EditorApplication.Exit(2);
      }
      Debug.Log("[GodzillaSetup] resolved OK");
      EditorApplication.Exit(0);
    }
  }
}

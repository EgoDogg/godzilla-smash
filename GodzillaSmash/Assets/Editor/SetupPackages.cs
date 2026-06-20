using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;

// One-shot headless package setup. Universal-2D already brings URP 2D + 2D Animation/Sprite/Tilemap.
// Run:    Unity -batchmode -quit -executeMethod GodzillaSetup.SetupPackages.Run     (core pkgs)
// MCP:    Unity -batchmode -quit -executeMethod GodzillaSetup.SetupPackages.AddMcp  (OpenUPM Unity-MCP)
namespace GodzillaSetup {
  public static class SetupPackages {
    static readonly string[] Core = { "com.unity.inputsystem", "com.unity.cinemachine", "com.unity.test-framework" };
    public static void Run()    { Add(Core); }
    public static void AddMcp() { Add(new[] { "com.ivanmurzak.unity.mcp" }); }
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

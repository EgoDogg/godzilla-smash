// Godzilla.Editor/AddFxSortingLayer.cs — the ONE canonical "FX" SortingLayer helper (spec Step 1, correction #11).
//
// SEVEN FX specs each wanted to append a sorting layer named "FX"; this is the single idempotent implementation
// every baker/component calls. The FX layer is appended LAST = topmost = draws over the Default sprites, mirroring
// the web drawGlow 'screen' overlay painted on top of the body each frame (entities.js:1587).
//
// RE-GROUND FIX (Unity 6000.5): InternalEditorUtility.AddSortingLayer()/SetSortingLayerName() no longer exist, so the
// spec's preferred engine API is unavailable here. We use the version-independent fallback: append an m_SortingLayers
// element via SerializedObject and assign a deterministic non-zero uniqueID (Default is 0; everything references the
// layer by NAME, so the exact id only needs to be unique + non-zero). TagManager.asset lives OUTSIDE Assets/ so a
// SerializedObject + ApplyModifiedProperties + SaveAssets is the only batchmode-safe write (you cannot ImportAsset it).

using UnityEditor;
using UnityEngine;

namespace Godzilla.Editor
{
    public static class AddFxSortingLayer
    {
        const string LayerName = "FX";

        [MenuItem("Godzilla/Setup/Add FX Sorting Layer")]
        public static void Run() => EnsureFx();

        // Idempotent. Returns silently if an "FX" layer already exists (name-scan guard).
        public static void EnsureFx()
        {
            var tm = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
            var layers = tm.FindProperty("m_SortingLayers");
            for (int i = 0; i < layers.arraySize; i++)
                if (layers.GetArrayElementAtIndex(i).FindPropertyRelative("name").stringValue == LayerName)
                    return; // already present

            int idx = layers.arraySize;
            layers.InsertArrayElementAtIndex(idx);
            var el = layers.GetArrayElementAtIndex(idx);
            el.FindPropertyRelative("name").stringValue = LayerName;
            el.FindPropertyRelative("uniqueID").intValue = UniqueId(LayerName); // non-zero, deterministic
            var lockedProp = el.FindPropertyRelative("locked");
            if (lockedProp != null) lockedProp.boolValue = false;

            tm.ApplyModifiedProperties();
            AssetDatabase.SaveAssets();
        }

        // FNV-1a of the name, forced non-zero — stable across runs so re-baking never re-rolls the id.
        static int UniqueId(string s)
        {
            unchecked
            {
                uint h = 2166136261u;
                foreach (char c in s) { h ^= c; h *= 16777619u; }
                int id = (int)h;
                return id == 0 ? 1 : id;
            }
        }
    }
}

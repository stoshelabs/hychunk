// Private. Runs the game's own noise loaders on every node file in a folder (each file is one
// noise node as it appears in the data, with `File` references resolved against the data folder)
// and writes the values to <out>/<name>.json, for the TypeScript port to be compared with.
//   java -cp HytaleServer.jar tools/NodeHarness.java <dataFolder> <nodesFolder> <outFolder> <seed> [<seed> ...]
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.hypixel.hytale.procedurallib.json.NoisePropertyJsonLoader;
import com.hypixel.hytale.procedurallib.json.SeedResource;
import com.hypixel.hytale.procedurallib.json.SeedString;
import com.hypixel.hytale.procedurallib.property.NoiseProperty;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;

public class NodeHarness {
    @SuppressWarnings({"unchecked", "rawtypes"})
    public static void main(String[] args) throws Exception {
        Path data = Path.of(args[0]);
        File[] files = new File(args[1]).listFiles((d, n) -> n.endsWith(".json"));
        java.util.Arrays.sort(files);
        Files.createDirectories(Path.of(args[2]));
        for (File f : files) {
            try {
                JsonElement json = JsonParser.parseString(Files.readString(f.toPath()).replace("﻿", ""));
                SeedString seed = new SeedString("ChunkGenerator", SeedString.DEFAULT_RESOURCE);
                NoiseProperty np = (NoiseProperty) new NoisePropertyJsonLoader(seed, data, json).load();
                Random r = new Random(777);
                StringBuilder out = new StringBuilder("[");
                boolean first = true;
                for (int a = 3; a < args.length; a++) {
                    int s = Integer.parseInt(args[a]);
                    for (int n = 0; n < 300; n++) {
                        double range = n % 4 == 0 ? 300 : n % 4 == 1 ? 2000 : n % 4 == 2 ? 4000 : 20000;
                        double x = (r.nextDouble() - 0.5) * 2 * range, y = (r.nextDouble() - 0.5) * 2 * range;
                        out.append(first ? "\n" : ",\n").append('[').append(s).append(',').append(x).append(',').append(y).append(',').append(np.get(s, x, y)).append(']');
                        first = false;
                    }
                }
                Files.writeString(Path.of(args[2], f.getName()), out.append("\n]\n").toString());
            } catch (Throwable t) {
                Files.writeString(Path.of(args[2], f.getName() + ".error"), String.valueOf(t));
            }
        }
    }
}

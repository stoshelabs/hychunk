// Private. Loads the climate mask with the game's own loader and prints, per seed, where the unique
// zones (spawn, temple) end up and the mask colour / fade at sample points.
//   java -cp HytaleServer.jar tools/ClimateHarness.java <dataFolder> <out.json> <seed> [<seed> ...]
import com.hypixel.hytale.procedurallib.json.SeedString;
import com.hypixel.hytale.procedurallib.random.ICoordinateRandomizer;
import com.hypixel.hytale.server.worldgen.climate.ClimateGraph;
import com.hypixel.hytale.server.worldgen.climate.ClimateMaskProvider;
import com.hypixel.hytale.server.worldgen.climate.ClimateNoise;
import com.hypixel.hytale.server.worldgen.climate.UniqueClimateGenerator;
import com.hypixel.hytale.server.worldgen.loader.climate.ClimateMaskJsonLoader;
import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.Random;

public class ClimateHarness {
    static Object field(Object o, String name) throws Exception {
        Field f = ClimateMaskProvider.class.getDeclaredField(name);
        f.setAccessible(true);
        return f.get(o);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    public static void main(String[] args) throws Exception {
        try { run(args); } catch (Throwable t) { t.printStackTrace(); System.err.flush(); System.exit(2); }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    static void run(String[] args) throws Exception {
        Path data = Path.of(args[0]);
        StringBuilder out = new StringBuilder("[");
        for (int a = 2; a < args.length; a++) {
            int seed = Integer.parseInt(args[a]);
            SeedString s = new SeedString("ChunkGenerator", SeedString.DEFAULT_RESOURCE);
            ClimateMaskProvider base = new ClimateMaskJsonLoader(s, data, data.resolve("Mask.json")).load();
            ICoordinateRandomizer rnd = (ICoordinateRandomizer) field(base, "randomizer");
            ClimateNoise noise = (ClimateNoise) field(base, "noise");
            ClimateGraph graph = (ClimateGraph) field(base, "graph");
            UniqueClimateGenerator gen = (UniqueClimateGenerator) field(base, "uniqueGenerator");
            UniqueClimateGenerator applied = gen.apply(seed, noise, graph);
                        out.append(a > 2 ? ",\n" : "\n").append("{\"seed\":").append(seed).append(",\"uniques\":[");
            UniqueClimateGenerator.Unique[] us = applied.zones();
            for (int i = 0; i < us.length; i++) {
                org.joml.Vector2i pos = us[i].position().join();
                out.append(i > 0 ? "," : "").append('[').append(us[i].color()).append(',').append(us[i].radius()).append(',').append(pos.x).append(',').append(pos.y).append(']');
            }
            out.append("],\"samples\":[");
            Random r = new Random(4242);
            for (int n = 0; n < 1500; n++) {
                double range = n % 3 == 0 ? 500 : n % 3 == 1 ? 5000 : 30000;
                double x = Math.floor((r.nextDouble() - 0.5) * 2 * range), z = Math.floor((r.nextDouble() - 0.5) * 2 * range);
                double rx = rnd.randomDoubleX(seed, x, z), rz = rnd.randomDoubleY(seed, x, z);
                // What ClimateMaskProvider.get and .distance do, without the thread-local resource.
                int mask = applied.generate((int) Math.floor(rx), (int) Math.floor(rz));
                double fade;
                if (mask != -1) {
                    fade = Double.NaN;
                } else {
                    ClimateNoise.Buffer buf = new ClimateNoise.Buffer();
                    int id = noise.generate(seed, rx, rz, buf, graph);
                    mask = com.hypixel.hytale.server.worldgen.climate.ClimateType.color(id, graph);
                    fade = buf.fade;
                }
                out.append(n > 0 ? "," : "").append('[').append(x).append(',').append(z).append(',').append(rx).append(',').append(rz).append(',').append(mask).append(',').append(fade).append(']');
            }
            out.append("]}");
        }
        java.nio.file.Files.writeString(Path.of(args[1]), out.append("\n]\n").toString());
    }
}

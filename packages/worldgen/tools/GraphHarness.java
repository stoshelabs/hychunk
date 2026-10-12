// Private. Runs the game's own noise-graph loaders on the data files and prints values, so our
// interpreter can be compared with them exactly.
//   java -cp HytaleServer.jar tools/GraphHarness.java <dataFolder> <File name> <seed> [<seed> ...] > fixture.json
import com.google.gson.JsonObject;
import com.hypixel.hytale.procedurallib.json.NoisePropertyJsonLoader;
import com.hypixel.hytale.procedurallib.json.SeedResource;
import com.hypixel.hytale.procedurallib.json.SeedString;
import com.hypixel.hytale.procedurallib.property.NoiseProperty;
import java.nio.file.Path;
import java.util.Random;

public class GraphHarness {
    @SuppressWarnings({"unchecked", "rawtypes"})
    public static void main(String[] args) {
        Path data = Path.of(args[0]);
        JsonObject root = new JsonObject();
        root.addProperty("File", args[1]);
        SeedString seed = new SeedString("ChunkGenerator", SeedString.DEFAULT_RESOURCE);
        NoiseProperty np = (NoiseProperty) new NoisePropertyJsonLoader(seed, data, root).load();
        Random r = new Random(777);
        StringBuilder out = new StringBuilder("[");
        boolean first = true;
        for (int a = 2; a < args.length; a++) {
            int s = Integer.parseInt(args[a]);
            for (int n = 0; n < 700; n++) {
                double range = n % 4 == 0 ? 300 : n % 4 == 1 ? 2000 : n % 4 == 2 ? 4000 : 20000;
                double x = (r.nextDouble() - 0.5) * 2 * range, y = (r.nextDouble() - 0.5) * 2 * range;
                out.append(first ? "\n" : ",\n").append('[').append(s).append(',').append(x).append(',').append(y).append(',').append(np.get(s, x, y)).append(']');
                first = false;
            }
        }
        System.out.print(out.append("\n]\n"));
    }
}

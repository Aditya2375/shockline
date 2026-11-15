import java.lang.reflect.*;
import java.util.*;
import shockline.Engine;

public class Dump {
  static String json(Object x) throws Exception {
    if (x == null) return "null";
    if (x instanceof String) return "\"" + x + "\"";
    if (x instanceof Number || x instanceof Boolean) return x.toString();
    List<String> a = new ArrayList<>();
    if (x instanceof List<?> l) {
      for (Object v : l) a.add(json(v));
      return "[" + String.join(",", a) + "]";
    }
    for (var c : x.getClass().getRecordComponents())
      a.add("\"" + c.getName() + "\":" + json(c.getAccessor().invoke(x)));
    return "{" + String.join(",", a) + "}";
  }

  public static void main(String[] args) throws Exception {
    if (args[0].equals("forecast")) {
      System.out.println(
          json(
              Engine.forecast(
                  Double.parseDouble(args[1]),
                  Double.parseDouble(args[2]),
                  Double.parseDouble(args[3]),
                  Double.parseDouble(args[4]))));
      return;
    }
    System.out.println(
        json(
            Engine.run(
                new Engine.Params(
                    Long.parseLong(args[0]),
                    args[1],
                    Double.parseDouble(args[2]),
                    Double.parseDouble(args[3]),
                    Double.parseDouble(args[4])))));
  }
}
